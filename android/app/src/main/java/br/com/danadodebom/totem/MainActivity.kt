package br.com.danadodebom.totem

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * Abre o totem do Mercado Danado de Bom (app web) em tela cheia na Moderninha Smart e
 * entrega à página a PlugPag (pagamento, estorno e impressão) como window.PlugPagNativo.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var prefs: SharedPreferences
    private lateinit var ponte: PontePlugPag

    /** Só páginas deste endereço podem usar a maquininha. */
    @Volatile
    var origemPermitida: String = ""
        private set

    @Volatile
    var urlAtual: String = ""
        private set

    private var pedidoCamera: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        prefs = getSharedPreferences("totem", Context.MODE_PRIVATE)

        web = WebView(this)
        setContentView(web)
        ponte = PontePlugPag(this, web)
        configurarWebView()

        if (prefs.getString(CHAVE_LOJA, "").isNullOrBlank()) mostrarConfiguracao(primeiraVez = true) else carregar()
    }

    override fun onResume() {
        super.onResume()
        telaCheia()
        if (prefs.getBoolean(CHAVE_FIXAR, false)) {
            try {
                startLockTask()
            } catch (_: Exception) {
            }
        }
    }

    private fun telaCheia() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    private fun configurarWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            userAgentString = "$userAgentString TotemDanadoDeBom/${BuildConfig.VERSION_NAME}"
        }
        web.addJavascriptInterface(ponte, "PlugPagNativo")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Navegação só dentro do próprio app; qualquer outro endereço é bloqueado (totem não vira navegador).
                return !origemOk(request.url.toString())
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                urlAtual = url
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                urlAtual = url
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val querCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (!querCamera || !origemOk(request.origin.toString())) {
                        request.deny()
                        return@runOnUiThread
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        pedidoCamera = request
                        requestPermissions(arrayOf(Manifest.permission.CAMERA), PEDIDO_CAMERA)
                    }
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == PEDIDO_CAMERA) {
            val p = pedidoCamera
            pedidoCamera = null
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) p?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else p?.deny()
        }
    }

    fun origemOk(url: String): Boolean = origemPermitida.isNotEmpty() && url.startsWith(origemPermitida)

    private fun carregar() {
        val base = (prefs.getString(CHAVE_URL, BuildConfig.URL_PADRAO) ?: BuildConfig.URL_PADRAO).trim().trimEnd('/') + "/"
        val uri = Uri.parse(base)
        origemPermitida = "${uri.scheme}://${uri.authority}/"
        val loja = prefs.getString(CHAVE_LOJA, "") ?: ""
        web.loadUrl("${base}maquininha.html#/totem/${Uri.encode(loja)}")
    }

    // O totem não tem "voltar": o cliente não pode sair do app pela tecla do aparelho.
    @Deprecated("Totem")
    override fun onBackPressed() {
    }

    /** Chamado pela página (Administração → Lojas e totens) ou na primeira abertura. */
    fun pedirConfiguracao() = runOnUiThread {
        val pin = prefs.getString(CHAVE_PIN, "") ?: ""
        if (pin.isEmpty()) {
            mostrarConfiguracao(false)
            return@runOnUiThread
        }
        val campo = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "PIN de configuração"
        }
        AlertDialog.Builder(this)
            .setTitle("Configuração do totem")
            .setView(campo)
            .setPositiveButton("Entrar") { _, _ ->
                if (campo.text.toString() == pin) mostrarConfiguracao(false)
                else Toast.makeText(this, "PIN incorreto", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun mostrarConfiguracao(primeiraVez: Boolean) {
        val dp = resources.displayMetrics.density
        val caixa = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((20 * dp).toInt(), (8 * dp).toInt(), (20 * dp).toInt(), 0)
        }
        fun rotulo(t: String) = TextView(this).apply { text = t; setPadding(0, (10 * dp).toInt(), 0, 0) }
        val url = EditText(this).apply { setText(prefs.getString(CHAVE_URL, BuildConfig.URL_PADRAO)); inputType = InputType.TYPE_TEXT_VARIATION_URI }
        val loja = EditText(this).apply { setText(prefs.getString(CHAVE_LOJA, "")); hint = "ex.: loja1" }
        val pin = EditText(this).apply {
            setText(prefs.getString(CHAVE_PIN, ""))
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "4 a 8 números"
        }
        val fixar = CheckBox(this).apply { text = "Fixar o app na tela (modo quiosque)"; isChecked = prefs.getBoolean(CHAVE_FIXAR, false) }
        val info = TextView(this).apply {
            textSize = 12f
            text = "App ${BuildConfig.VERSION_NAME} · WebView ${versaoWebView()}\nO código da loja aparece em Administração → Lojas e totens (link do totem: …#/totem/CÓDIGO)."
        }
        caixa.addView(rotulo("Endereço do app"))
        caixa.addView(url)
        caixa.addView(rotulo("Código da loja"))
        caixa.addView(loja)
        caixa.addView(rotulo("PIN para abrir esta configuração"))
        caixa.addView(pin)
        caixa.addView(fixar)
        caixa.addView(info)

        val dialogo = AlertDialog.Builder(this)
            .setTitle(if (primeiraVez) "Bem-vindo! Configure o totem" else "Configuração do totem")
            .setView(caixa)
            .setPositiveButton("Salvar", null)
            .setCancelable(!primeiraVez)
            .apply { if (!primeiraVez) setNegativeButton("Cancelar", null) }
            .create()
        dialogo.setOnShowListener {
            dialogo.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val u = url.text.toString().trim()
                val l = loja.text.toString().trim()
                val p = pin.text.toString().trim()
                when {
                    !u.startsWith("https://") -> Toast.makeText(this, "O endereço deve começar com https://", Toast.LENGTH_LONG).show()
                    l.isEmpty() -> Toast.makeText(this, "Informe o código da loja", Toast.LENGTH_LONG).show()
                    !Regex("^\\d{4,8}$").matches(p) -> Toast.makeText(this, "O PIN deve ter de 4 a 8 números", Toast.LENGTH_LONG).show()
                    else -> {
                        prefs.edit().putString(CHAVE_URL, u).putString(CHAVE_LOJA, l).putString(CHAVE_PIN, p).putBoolean(CHAVE_FIXAR, fixar.isChecked).apply()
                        if (!fixar.isChecked) try { stopLockTask() } catch (_: Exception) {}
                        dialogo.dismiss()
                        carregar()
                        if (fixar.isChecked) try { startLockTask() } catch (_: Exception) {}
                    }
                }
            }
        }
        dialogo.show()
    }

    fun versaoWebView(): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WebView.getCurrentWebViewPackage()?.versionName ?: "?"
        else Regex("Chrome/([\\d.]+)").find(web.settings.userAgentString)?.groupValues?.get(1) ?: "?"

    /** Entrega uma resposta à página: window.__mdbNativo.retorno(id, {...}). */
    fun responder(id: String, dados: JSONObject) = enviarJs("retorno", id, dados)

    fun evento(id: String, dados: JSONObject) = enviarJs("evento", id, dados)

    private fun enviarJs(funcao: String, id: String, dados: JSONObject) = runOnUiThread {
        web.evaluateJavascript("window.__mdbNativo && window.__mdbNativo.$funcao(${JSONObject.quote(id)}, $dados)", null)
    }

    override fun onDestroy() {
        ponte.encerrar()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val PEDIDO_CAMERA = 10
        private const val CHAVE_URL = "url"
        private const val CHAVE_LOJA = "loja"
        private const val CHAVE_PIN = "pin"
        private const val CHAVE_FIXAR = "fixar"
    }
}
