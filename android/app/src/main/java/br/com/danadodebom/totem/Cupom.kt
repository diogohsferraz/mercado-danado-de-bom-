package br.com.danadodebom.totem

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Desenha o cupom (linhas de texto + QR Code da NFC-e) num bitmap da largura da bobina
 * e grava em BMP de 24 bits, formato aceito pelo printFromFile da PlugPag.
 */
object Cupom {
    /** Largura útil da impressora térmica da Moderninha Smart (bobina de 58 mm). */
    private const val LARGURA = 384

    fun gerarArquivo(ctx: Context, j: JSONObject): File {
        val linhas = j.optJSONArray("linhas")
        val normal = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 22f; typeface = Typeface.MONOSPACE }
        val qr = j.optString("qr").takeIf { it.startsWith("data:image") }?.let { decodificar(it) }

        // Primeiro mede a altura, depois desenha.
        var altura = 16
        val itens = mutableListOf<Triple<String, Paint, Boolean>>()
        for (i in 0 until (linhas?.length() ?: 0)) {
            val l = linhas!!.getJSONObject(i)
            val p = Paint(normal).apply {
                if (l.optBoolean("negrito")) typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                if (l.optBoolean("grande")) textSize = 28f
            }
            for (parte in quebrar(l.optString("t"), p)) {
                itens += Triple(parte, p, l.optBoolean("centro"))
                altura += (p.textSize * 1.35f).toInt()
            }
        }
        val qrLado = 240
        if (qr != null) altura += qrLado + 16
        altura += 24

        val bmp = Bitmap.createBitmap(LARGURA, altura, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.WHITE)
        var y = 16f
        for ((texto, p, centro) in itens) {
            y += p.textSize
            val x = if (centro) (LARGURA - p.measureText(texto)) / 2f else 4f
            c.drawText(texto, x.coerceAtLeast(0f), y, p)
            y += p.textSize * 0.35f
        }
        if (qr != null) {
            val esq = (LARGURA - qrLado) / 2
            val topo = y.toInt() + 8
            c.drawBitmap(qr, null, Rect(esq, topo, esq + qrLado, topo + qrLado), Paint().apply { isFilterBitmap = false })
        }

        val arquivo = File(ctx.cacheDir, "cupom.bmp")
        FileOutputStream(arquivo).use { gravarBmp(bmp, it) }
        bmp.recycle()
        return arquivo
    }

    private fun quebrar(texto: String, p: Paint): List<String> {
        if (p.measureText(texto) <= LARGURA - 8) return listOf(texto)
        val partes = mutableListOf<String>()
        var atual = ""
        for (palavra in texto.split(" ")) {
            val tentativa = if (atual.isEmpty()) palavra else "$atual $palavra"
            if (p.measureText(tentativa) <= LARGURA - 8) atual = tentativa
            else {
                if (atual.isNotEmpty()) partes += atual
                atual = palavra
            }
        }
        if (atual.isNotEmpty()) partes += atual
        return partes
    }

    private fun decodificar(dataUrl: String): Bitmap? = try {
        val bytes = Base64.decode(dataUrl.substringAfter(","), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
        null
    }

    /** BMP 24 bits, linhas de baixo para cima, cada linha alinhada em 4 bytes. */
    private fun gravarBmp(bmp: Bitmap, out: FileOutputStream) {
        val w = bmp.width
        val h = bmp.height
        val linha = (w * 3 + 3) and 3.inv()
        val tamanho = 54 + linha * h
        val cab = ByteArray(54)
        fun int(pos: Int, v: Int) {
            cab[pos] = (v and 0xff).toByte(); cab[pos + 1] = (v shr 8 and 0xff).toByte()
            cab[pos + 2] = (v shr 16 and 0xff).toByte(); cab[pos + 3] = (v shr 24 and 0xff).toByte()
        }
        cab[0] = 'B'.code.toByte(); cab[1] = 'M'.code.toByte()
        int(2, tamanho); int(10, 54); int(14, 40); int(18, w); int(22, h)
        cab[26] = 1; cab[28] = 24
        int(34, linha * h); int(38, 2835); int(42, 2835)
        out.write(cab)
        val px = IntArray(w)
        val buf = ByteArray(linha)
        for (yy in h - 1 downTo 0) {
            bmp.getPixels(px, 0, w, 0, yy, w, 1)
            for (x in 0 until w) {
                val cor = px[x]
                buf[x * 3] = (cor and 0xff).toByte()
                buf[x * 3 + 1] = (cor shr 8 and 0xff).toByte()
                buf[x * 3 + 2] = (cor shr 16 and 0xff).toByte()
            }
            out.write(buf)
        }
    }
}
