# Voz Local

MVP local para transformar texto em português do Brasil em fala com a voz da
própria pessoa. A interface grava ou recebe uma amostra, envia os dados apenas
para um serviço Python no computador, reproduz o resultado e permite baixar um
arquivo WAV.

Não há serviço pago, chave de API nem envio de texto ou voz a terceiros. O
primeiro uso acessa o Hugging Face somente para baixar os pesos públicos do
modelo.

## Como funciona

- **Interface:** Next.js, React e gravação nativa pelo navegador.
- **Síntese:** Chatterbox Multilingual V3 local, licenciado em MIT.
- **Português:** variante `v3`, idioma do modelo fixado como `pt` e experiência
  configurada para `pt-BR`.
- **Voz:** clonagem zero-shot a partir da amostra enviada em cada solicitação.
- **Responsabilidade:** consentimento obrigatório e marca-d’água PerTh inserida
  pelo próprio Chatterbox em todo áudio gerado.

## Requisitos

- Node.js 20 ou mais recente e pnpm;
- Python 3.10 a 3.13 — Python 3.11 é a opção recomendada pelo Chatterbox;
- Git e FFmpeg disponíveis no terminal;
- cerca de 5 GB livres para dependências e pesos do modelo;
- 8 GB de memória como mínimo prático. GPU CUDA ou Apple Silicon é opcional,
  mas reduz bastante o tempo de síntese.

No Ubuntu ou Debian, instale o FFmpeg com:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

No macOS:

```bash
brew install ffmpeg
```

## Instalação

Instale a interface:

```bash
pnpm install
cp .env.example .env.local
```

Crie o ambiente Python e instale o serviço de voz:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

No PowerShell do Windows, a ativação equivalente é:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

## Executar

Abra dois terminais na raiz do projeto.

No primeiro, inicie o serviço local de voz:

```bash
TTS_DEVICE=auto .venv/bin/python -m uvicorn backend.app:app \
  --host 127.0.0.1 --port 8000
```

Valores aceitos em `TTS_DEVICE`: `auto`, `cpu`, `cuda` ou `mps`. No PowerShell,
use `$env:TTS_DEVICE="auto"` antes do comando.

No segundo terminal, inicie a interface:

```bash
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000). O microfone funciona em
`localhost`; em outro domínio, o navegador exige HTTPS.

Na primeira geração, o Chatterbox baixa os pesos do modelo e pode demorar
alguns minutos. As próximas solicitações reutilizam o modelo já carregado.

## Uso

1. Escreva até 300 caracteres em português do Brasil.
2. Grave de 6 a 15 segundos ou envie WAV, MP3, M4A, WebM, OGG ou FLAC.
3. Use uma fala limpa, sem música e com pouco ruído.
4. Confirme que a voz é sua e gere o áudio.
5. Ouça o resultado e selecione **Baixar áudio WAV**.

Exemplo de texto:

> Olá! Esta é uma demonstração criada localmente com a minha própria voz.

## Verificação direta do serviço

Confira a configuração de idioma sem carregar o modelo:

```bash
curl http://127.0.0.1:8000/saude
```

Resposta esperada:

```json
{
  "status": "pronto",
  "idioma": "pt-BR",
  "modelo": "ResembleAI/chatterbox",
  "versao_modelo": "v3",
  "modelo_carregado": false,
  "dispositivo": "detectado no primeiro uso"
}
```

Faça uma síntese completa com uma amostra própria:

```bash
curl --fail-with-body \
  -F 'texto=Olá! Esta frase foi criada em português do Brasil.' \
  -F 'consentimento=true' \
  -F 'amostra=@minha-voz.wav;type=audio/wav' \
  http://127.0.0.1:8000/sintetizar \
  --output minha-voz-em-portugues.wav
```

## Segurança e privacidade

- O serviço escuta apenas em `127.0.0.1` no comando recomendado.
- A API exige consentimento explícito em toda síntese.
- Texto limitado a 300 caracteres; envio de áudio limitado a 15 MB.
- O formato real é identificado pela assinatura do arquivo, não apenas pelo
  nome ou tipo informado pelo navegador.
- O nome de arquivo enviado nunca é reutilizado.
- A amostra fica em um diretório temporário privado, com permissão restrita, e
  é apagada junto com o resultado temporário ao fim da solicitação.
- As sínteses são serializadas para impedir a mistura de condicionais de voz
  entre solicitações simultâneas.
- Respostas não são armazenadas em cache.
- O áudio inclui a marca-d’água digital padrão do Chatterbox.

Não exponha a porta 8000 diretamente na internet. Para uso compartilhado, adote
autenticação, limite de requisições, isolamento do processo e uma política
formal de consentimento.

## Testes

Testes da interface, validações e rota de encaminhamento:

```bash
pnpm test
pnpm lint
pnpm build
```

Testes do serviço Python sem baixar o modelo pesado:

```bash
python -m venv .venv-test
source .venv-test/bin/activate
python -m pip install -r backend/requirements-test.txt
python -m pytest backend/tests
```

Os testes usam um sintetizador substituto para validar upload, descarte,
consentimento e resposta WAV. Um teste separado confirma que o adaptador real
carrega a variante `v3` e chama a geração com `language_id="pt"`. A verificação
manual com `curl` acima cobre o caminho de inferência completa após o download
dos pesos.

## Limitações do MVP

- Inferência em CPU funciona, mas pode ser lenta.
- O modelo recebe o código oficial `pt`; o sotaque pt-BR é reforçado pelo texto
  brasileiro e pela amostra da própria pessoa.
- Cada solicitação aceita uma amostra e produz um WAV; não há biblioteca de
  vozes persistente, justamente para evitar retenção desnecessária.
