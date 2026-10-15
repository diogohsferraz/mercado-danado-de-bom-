# App Android para a maquininha PagBank Smart 2

O app **Danado de Bom** roda na Moderninha Smart / Smart 2 e transforma a maquininha em totem completo:

- abre o totem do mercado em tela cheia (`maquininha.html#/totem/<loja>`);
- cobra **crédito, débito e Pix na própria máquina** pela biblioteca **PlugPag** da PagBank, mostrando na tela as mensagens dela ("aproxime o cartão", "digite a senha");
- **imprime o comprovante da compra** (itens, total e NSU, com a marca "não é documento fiscal") e reimprime a via do cartão. A NFC-e é emitida, mas não é impressa: o totem pergunta se o cliente quer a nota por e-mail;
- **estorna** o pagamento quando a venda é estornada no painel;
- usa a câmera da máquina para ler código de barras;
- tem modo quiosque (fixa o app na tela) e configuração protegida por PIN.

O app é só uma "casca": a lógica fica no site. Uma atualização do mercado (preços, telas, regras) não exige novo APK nem nova homologação.

## Ver antes de instalar (preview)

Abra `https://diogohsferraz.github.io/mercado-danado-de-bom-/preview-maquininha.html` em qualquer navegador. É o mesmo app, na medida da tela da Smart 2, com uma **maquininha simulada**: você aprova ou recusa o pagamento, testa o Pix e vê o comprovante como sairia na bobina. Nada é cobrado. No celular, use `maquininha.html?simular=1#/totem/loja1`.

## Como conseguir o APK

O GitHub compila o app automaticamente a cada mudança na pasta `android/`:
1. Abra **Actions → App Android (maquininha PagBank)**.
2. Entre na execução mais recente e baixe o artefato **totem-danado-de-bom-apk**:
   - `app-debug.apk` é para a máquina de desenvolvimento;
   - `app-release-unsigned.apk` é a base da versão a homologar.

Para compilar no computador: Android Studio → abrir a pasta `android/` → Run. Ou, pela linha de comando, `./gradlew assembleDebug`.

## Passo a passo com a PagBank

1. **Parceria e máquina de desenvolvimento.** Peça ao seu gerente comercial PagBank, ou pelo developer.pagbank.com.br, acesso à plataforma de desenvolvimento da Moderninha Smart. Uma máquina de produção comum **não** aceita instalar apps de fora.
2. **Instalar na máquina de desenvolvimento** com o cabo USB e a depuração ativada:
   ```bash
   adb install -r app-debug.apk
   ```
3. **Primeira abertura:** o app pede o endereço do site, o **código da loja** (ex.: `loja1`, que aparece no link do totem em Administração → Lojas e totens) e um **PIN** para proteger a configuração.
4. **Ativação da PlugPag:** em Administração → Lojas e totens → *Maquininha PagBank Smart*, informe o **código de ativação** fornecido pela PagBank e toque em **Ativar**. A tela mostra se a máquina está ativada e a versão do WebView.
5. **Testes na máquina de desenvolvimento:**
   - venda no crédito, no débito e no Pix;
   - recusa e cancelamento no meio do pagamento;
   - impressão do cupom e da via do cartão;
   - estorno pelo painel (abra o painel na própria máquina);
   - leitura de código de barras pela câmera.
6. **Homologação:** envie o APK para a PagBank, assinado com a sua chave (veja abaixo). Depois de aprovado, a PagBank publica o app na **Loja de Aplicativos** dela, e ele é instalado nas suas Smart 2 de produção.

### Assinar o APK de produção

```bash
keytool -genkeypair -v -keystore danado.jks -alias danado -keyalg RSA -keysize 2048 -validity 10000
apksigner sign --ks danado.jks --out app-release.apk app-release-unsigned.apk
```
Guarde o arquivo `.jks` e a senha em local seguro. Toda atualização precisa ser assinada com a mesma chave. Nunca envie o `.jks` para o GitHub (já está no `.gitignore`).

## Conferir na máquina de desenvolvimento

O código segue a documentação pública da PlugPag (wrapper 1.35.0) e uma integração de código aberto que a usa. **Ainda não foi rodado numa maquininha.** Confira:

| Ponto | Onde está |
|---|---|
| Permissão `br.com.uol.pagseguro.permission.MANAGE_PAYMENTS` | `AndroidManifest.xml` |
| Limite de 10 caracteres alfanuméricos na referência da venda | `PontePlugPag.pagar` |
| Impressão: bitmap BMP de 384 px de largura, qualidade 4, avanço 70 | `Cupom.kt` e `PontePlugPag.imprimir` |
| Estorno de Pix usando `VOID_QRCODE` | `PontePlugPag.estornar` |
| Versão do WebView da máquina (o site usa um pacote compatível com Chrome 58 ou mais novo) | aparece na configuração e no painel |
| Entrega da NFC-e só por e-mail, quando o cliente pede: confirme com o contador que isso atende a SEFAZ-AL | `js/checkout.js` (fim da compra) |

Se a PagBank pedir mudanças na homologação (por exemplo, categoria de app ou ícone), os ajustes ficam no `AndroidManifest.xml` e em `res/`.

## Segurança

- Só páginas do endereço configurado podem usar a maquininha. Navegar para outro site é bloqueado.
- A configuração (endereço, loja, modo quiosque) exige o PIN definido na primeira abertura.
- A tecla "voltar" é desativada para o cliente não sair do totem.
