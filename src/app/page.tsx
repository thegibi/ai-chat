import { VoiceStudio } from "@/components/voice-studio";

export default function Home() {
  return (
    <main>
      <div className="ambient-orb ambient-orb-left" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-right" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Voz Local, início">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>Voz Local</span>
        </a>
        <div className="local-badge">
          <span aria-hidden="true" />
          Privado e local
        </div>
      </header>

      <div className="page-shell" id="inicio">
        <section className="hero" aria-labelledby="titulo-principal">
          <div className="hero-kicker">
            <span>Estúdio de voz com IA</span>
            <i aria-hidden="true" />
            <span>Português do Brasil</span>
          </div>
          <h1 id="titulo-principal">
            Seu texto.
            <br />
            <span>A sua própria voz.</span>
          </h1>
          <p>
            Grave uma amostra, escreva em português e crie um áudio com a sua
            voz — sem enviar seus dados para um serviço pago.
          </p>
        </section>

        <VoiceStudio />

      </div>

      <footer>
        <p>Feito para síntese responsável da sua própria voz.</p>
        <p>Chatterbox Multilingual V3 · pt-BR · execução local</p>
      </footer>
    </main>
  );
}
