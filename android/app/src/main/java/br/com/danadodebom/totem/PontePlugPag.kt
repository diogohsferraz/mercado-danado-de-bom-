package br.com.danadodebom.totem

import android.webkit.JavascriptInterface
import android.webkit.WebView
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPag
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagActivationData
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagEventData
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagEventListener
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagPaymentData
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagPrinterData
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagTransactionResult
import br.com.uol.pagseguro.plugpagservice.wrapper.PlugPagVoidData
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Métodos que a página chama como window.PlugPagNativo.<metodo>(id, json).
 * As chamadas da PlugPag bloqueiam (comunicação com o serviço da maquininha), então rodam
 * numa fila própria, uma de cada vez; a resposta volta para a página por MainActivity.responder().
 */
class PontePlugPag(private val activity: MainActivity, private val web: WebView) {

    private val plugPag: PlugPag by lazy { PlugPag(activity.applicationContext) }
    private val fila: ExecutorService = Executors.newSingleThreadExecutor()

    fun encerrar() = fila.shutdownNow()

    private fun executar(id: String, json: String, bloco: (JSONObject) -> JSONObject) {
        // Só o app do mercado (endereço configurado) pode cobrar ou imprimir.
        if (!activity.origemOk(activity.urlAtual)) {
            activity.responder(id, erro("Página não autorizada a usar a maquininha"))
            return
        }
        fila.execute {
            val resposta = try {
                bloco(if (json.isBlank()) JSONObject() else JSONObject(json))
            } catch (e: Exception) {
                erro(e.message ?: e.javaClass.simpleName)
            }
            activity.responder(id, resposta)
        }
    }

    private fun erro(msg: String, codigo: String? = null) = JSONObject().put("ok", false).put("mensagem", msg).apply { if (codigo != null) put("codigo", codigo) }

    private fun resultadoTransacao(r: PlugPagTransactionResult): JSONObject =
        if (r.result == PlugPag.RET_OK) {
            JSONObject().put("ok", true)
                .put("transactionCode", r.transactionCode ?: "")
                .put("transactionId", r.transactionId ?: "")
                .put("nsu", r.hostNsu ?: "")
                .put("bandeira", r.cardBrand ?: "")
        } else {
            erro(r.message?.takeIf { it.isNotBlank() } ?: "Operação não aprovada", r.errorCode)
        }

    private fun ouvirEventos(id: String) = plugPag.setEventListener(object : PlugPagEventListener {
        override fun onEvent(eventData: PlugPagEventData) {
            activity.evento(id, JSONObject().put("codigo", eventData.eventCode).put("mensagem", eventData.customMessage ?: ""))
        }
    })

    private fun pararEventos() = plugPag.setEventListener(object : PlugPagEventListener {
        override fun onEvent(eventData: PlugPagEventData) {}
    })

    @JavascriptInterface
    fun pagar(id: String, json: String) = executar(id, json) { j ->
        val tipo = when (j.optString("tipo")) {
            "debito" -> PlugPag.TYPE_DEBITO
            "pix" -> PlugPag.TYPE_PIX
            else -> PlugPag.TYPE_CREDITO
        }
        val parcelas = j.optInt("parcelas", 1).coerceAtLeast(1)
        val valor = j.getInt("valorCentavos")
        require(valor > 0) { "Valor inválido" }
        val dados = PlugPagPaymentData(
            type = tipo,
            amount = valor,
            installmentType = if (parcelas > 1) PlugPag.INSTALLMENT_TYPE_PARC_VENDEDOR else PlugPag.INSTALLMENT_TYPE_A_VISTA,
            installments = parcelas,
            userReference = j.optString("referencia").filter { it.isLetterOrDigit() }.take(10),
            printReceipt = j.optBoolean("imprimirVia", false),
        )
        ouvirEventos(id)
        try {
            resultadoTransacao(plugPag.doPayment(dados))
        } finally {
            pararEventos()
        }
    }

    /** Cancela a operação em andamento (cliente desistiu enquanto a maquininha esperava o cartão). */
    @JavascriptInterface
    fun cancelarOperacao(id: String, json: String) {
        if (!activity.origemOk(activity.urlAtual)) return
        // Fora da fila: a fila está ocupada esperando o doPayment terminar.
        Thread {
            val r = try {
                plugPag.abort()
                JSONObject().put("ok", true)
            } catch (e: Exception) {
                erro(e.message ?: "Falha ao cancelar")
            }
            activity.responder(id, r)
        }.start()
    }

    @JavascriptInterface
    fun estornar(id: String, json: String) = executar(id, json) { j ->
        val dados = PlugPagVoidData(
            transactionCode = j.getString("transactionCode"),
            transactionId = j.getString("transactionId"),
            printReceipt = false,
            voidType = if (j.optString("tipo") == "pix") PlugPag.VOID_QRCODE else PlugPag.VOID_PAYMENT,
        )
        ouvirEventos(id)
        try {
            resultadoTransacao(plugPag.voidPayment(dados))
        } finally {
            pararEventos()
        }
    }

    @JavascriptInterface
    fun imprimir(id: String, json: String) = executar(id, json) { j ->
        val arquivo = Cupom.gerarArquivo(activity, j)
        val r = plugPag.printFromFile(PlugPagPrinterData(arquivo.absolutePath, 4, 70))
        if (r.result == PlugPag.RET_OK) JSONObject().put("ok", true) else erro(r.message ?: "Falha na impressão", r.errorCode)
    }

    @JavascriptInterface
    fun reimprimirViaCliente(id: String, json: String) = executar(id, json) {
        val r = plugPag.reprintCustomerReceipt()
        if (r.result == PlugPag.RET_OK) JSONObject().put("ok", true) else erro(r.message ?: "Falha na impressão", r.errorCode)
    }

    @JavascriptInterface
    fun ativar(id: String, json: String) = executar(id, json) { j ->
        val r = plugPag.initializeAndActivatePinpad(PlugPagActivationData(j.getString("codigo")))
        if (r.result == PlugPag.RET_OK) JSONObject().put("ok", true) else erro(r.message?.takeIf { it.isNotBlank() } ?: "Ativação recusada", r.errorCode)
    }

    @JavascriptInterface
    fun status(id: String, json: String) = executar(id, json) {
        JSONObject().put("ok", true)
            .put("ativado", plugPag.isAuthenticated())
            .put("versaoApp", BuildConfig.VERSION_NAME)
            .put("webview", activity.versaoWebView())
    }

    @JavascriptInterface
    fun configurar(id: String, json: String) {
        if (activity.origemOk(activity.urlAtual)) activity.pedirConfiguracao()
    }
}
