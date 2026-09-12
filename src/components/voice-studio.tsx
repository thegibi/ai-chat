"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MAX_TEXT_LENGTH,
  validateAudio,
  validateText,
} from "@/lib/synthesis";

const MAX_RECORDING_SECONDS = 30;

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V6a3.75 3.75 0 1 0-7.5 0v5.5A3.75 3.75 0 0 0 12 15.25Z" />
      <path d="M5.75 10.75v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.75V21M9 21h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 3 .9 3.1A7 7 0 0 0 17.7 11l3.3 1-3.3 1a7 7 0 0 0-4.8 4.9L12 21l-.9-3.1A7 7 0 0 0 6.3 13L3 12l3.3-1a7 7 0 0 0 4.8-4.9L12 3Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19.5h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12.5 4.25 4.25L19 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.5 7h15M9 3.5h6M7 7l.7 13h8.6L17 7M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

function preferredRecordingType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
  );
}

function extensionForMediaType(mediaType: string) {
  if (mediaType.includes("mp4")) return "m4a";
  if (mediaType.includes("ogg")) return "ogg";
  if (mediaType.includes("wav")) return "wav";
  return "webm";
}

function formatSeconds(seconds: number) {
  return `0:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceStudio() {
  const [text, setText] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleOrigin, setSampleOrigin] = useState<
    "gravação" | "arquivo" | null
  >(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sampleUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (
        recorderRef.current &&
        recorderRef.current.state !== "inactive"
      ) {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function replaceSampleUrl(nextUrl: string | null) {
    if (sampleUrlRef.current) {
      URL.revokeObjectURL(sampleUrlRef.current);
    }
    sampleUrlRef.current = nextUrl;
    setSampleUrl(nextUrl);
  }

  function replaceResultUrl(nextUrl: string | null) {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
    }
    resultUrlRef.current = nextUrl;
    setResultUrl(nextUrl);
  }

  function stopRecordingResources() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function chooseSample(file: File, origin: "gravação" | "arquivo") {
    const validationError = validateAudio(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSample(file);
    setSampleOrigin(origin);
    replaceSampleUrl(URL.createObjectURL(file));
    replaceResultUrl(null);
    setError(null);
    setSuccessMessage(null);
  }

  function removeSample() {
    setSample(null);
    setSampleOrigin(null);
    replaceSampleUrl(null);
    replaceResultUrl(null);
    setError(null);
    setSuccessMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function startRecording() {
    setError(null);
    setSuccessMessage(null);

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Este navegador não permite gravar áudio. Envie um arquivo de voz.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mediaType = preferredRecordingType();
      const recorder = mediaType
        ? new MediaRecorder(stream, { mimeType: mediaType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener("error", () => {
        setError("A gravação falhou. Tente novamente ou envie um arquivo.");
        setIsRecording(false);
        stopRecordingResources();
      });

      recorder.addEventListener(
        "stop",
        () => {
          const finalType =
            recorder.mimeType.split(";")[0] ||
            mediaType.split(";")[0] ||
            "audio/webm";
          const blob = new Blob(chunksRef.current, { type: finalType });
          const file = new File(
            [blob],
            `minha-voz.${extensionForMediaType(finalType)}`,
            { type: finalType, lastModified: Date.now() },
          );

          setIsRecording(false);
          stopRecordingResources();

          if (file.size === 0) {
            setError("Nenhum áudio foi capturado. Faça uma nova gravação.");
            return;
          }

          chooseSample(file, "gravação");
        },
        { once: true },
      );

      recorder.start(250);
      setRecordingSeconds(0);
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        const elapsed = Math.min(
          MAX_RECORDING_SECONDS,
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
        );
        setRecordingSeconds(elapsed);
      }, 250);

      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (recordingError) {
      stopRecordingResources();
      if (
        recordingError instanceof DOMException &&
        recordingError.name === "NotAllowedError"
      ) {
        setError(
          "Permita o acesso ao microfone ou envie uma gravação da sua voz.",
        );
      } else {
        setError(
          "Não foi possível acessar o microfone. Envie um arquivo de voz.",
        );
      }
    }
  }

  function stopRecording() {
    if (
      recorderRef.current &&
      recorderRef.current.state !== "inactive"
    ) {
      recorderRef.current.stop();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) chooseSample(file, "arquivo");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSynthesizing || isRecording) return;

    setError(null);
    setSuccessMessage(null);

    const textError = validateText(text);
    if (textError) {
      setError(textError);
      return;
    }

    if (!sample) {
      setError("Grave ou envie uma amostra da sua própria voz.");
      return;
    }

    const audioError = validateAudio(sample);
    if (audioError) {
      setError(audioError);
      return;
    }

    if (!hasConsent) {
      setError("Confirme que a voz é sua e que você autoriza a síntese.");
      return;
    }

    setIsSynthesizing(true);
    replaceResultUrl(null);

    try {
      const formData = new FormData();
      formData.set("texto", text.trim());
      formData.set("amostra", sample);
      formData.set("consentimento", "true");

      const response = await fetch("/api/sintetizar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          erro?: string;
        } | null;
        throw new Error(
          payload?.erro ??
            "Não foi possível gerar o áudio. Verifique o serviço local.",
        );
      }

      const audio = await response.blob();
      if (!audio.size) {
        throw new Error("O serviço não retornou um áudio válido.");
      }

      replaceResultUrl(URL.createObjectURL(audio));
      setSuccessMessage(
        "Áudio criado em português do Brasil com a sua amostra de voz.",
      );
    } catch (synthesisError) {
      setError(
        synthesisError instanceof Error
          ? synthesisError.message
          : "Não foi possível gerar o áudio. Tente novamente.",
      );
    } finally {
      setIsSynthesizing(false);
    }
  }

  return (
    <form className="studio-grid" onSubmit={handleSubmit} noValidate>
      <section className="studio-panel" aria-labelledby="texto-heading">
        <div className="step-heading">
          <span className="step-number">01</span>
          <div>
            <p className="eyebrow">Seu roteiro</p>
            <h2 id="texto-heading">Escreva o que será falado</h2>
          </div>
        </div>

        <label className="field-label" htmlFor="texto">
          Texto em português do Brasil
        </label>
        <div className="text-field">
          <textarea
            id="texto"
            name="texto"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
              setSuccessMessage(null);
            }}
            maxLength={MAX_TEXT_LENGTH}
            rows={8}
            placeholder="Ex.: Olá! Esta é uma demonstração criada com a minha própria voz."
            aria-describedby="texto-ajuda texto-contador"
          />
          <span
            id="texto-contador"
            className="character-count"
            aria-live="polite"
          >
            {text.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
        <p id="texto-ajuda" className="field-help">
          Use frases naturais em pt-BR. Pontuação ajuda a criar pausas e
          entonação.
        </p>

        <div className="privacy-note">
          <span className="privacy-dot" aria-hidden="true" />
          <p>
            O texto e a voz ficam no seu computador. Nenhum serviço pago ou
            chave de API é usado.
          </p>
        </div>
      </section>

      <section className="studio-panel" aria-labelledby="voz-heading">
        <div className="step-heading">
          <span className="step-number">02</span>
          <div>
            <p className="eyebrow">Sua voz</p>
            <h2 id="voz-heading">Adicione uma amostra limpa</h2>
          </div>
        </div>

        <div className="sample-actions">
          <button
            className={`record-button ${isRecording ? "is-recording" : ""}`}
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isSynthesizing}
          >
            <span className="button-icon">
              <MicrophoneIcon />
            </span>
            <span>
              <strong>
                {isRecording ? "Parar gravação" : "Gravar minha voz"}
              </strong>
              <small>
                {isRecording
                  ? `${formatSeconds(recordingSeconds)} / 0:30`
                  : "Use o microfone deste dispositivo"}
              </small>
            </span>
          </button>

          <div className="action-divider" aria-hidden="true">
            <span>ou</span>
          </div>

          <label
            className={`upload-button ${
              isRecording || isSynthesizing ? "is-disabled" : ""
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/flac"
              onChange={handleFileChange}
              disabled={isRecording || isSynthesizing}
            />
            <span className="button-icon">
              <UploadIcon />
            </span>
            <span>
              <strong>Enviar uma gravação</strong>
              <small>WAV, MP3, M4A, WebM, OGG ou FLAC · até 15 MB</small>
            </span>
          </label>
        </div>

        {sample && sampleUrl ? (
          <div className="sample-preview">
            <div className="sample-preview-heading">
              <div>
                <span className="ready-icon">
                  <CheckIcon />
                </span>
                <span>
                  <strong>Amostra pronta</strong>
                  <small>
                    {sampleOrigin === "gravação"
                      ? "Gravada agora"
                      : sample.name}
                  </small>
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={removeSample}
                disabled={isSynthesizing}
                aria-label="Remover amostra de voz"
              >
                <TrashIcon />
              </button>
            </div>
            <audio
              aria-label="Ouvir amostra de voz"
              controls
              preload="metadata"
              src={sampleUrl}
            >
              Seu navegador não consegue reproduzir esta amostra.
            </audio>
          </div>
        ) : (
          <div className="recording-tips">
            <p>Para um resultado mais parecido com você:</p>
            <ul>
              <li>fale por 6 a 15 segundos;</li>
              <li>grave em um lugar silencioso, sem música;</li>
              <li>use sua voz natural e fale em português.</li>
            </ul>
          </div>
        )}

        <label className="consent-field">
          <input
            type="checkbox"
            checked={hasConsent}
            onChange={(event) => {
              setHasConsent(event.target.checked);
              setError(null);
            }}
          />
          <span className="custom-checkbox" aria-hidden="true">
            <CheckIcon />
          </span>
          <span>
            Confirmo que esta voz é minha e autorizo seu uso para gerar este
            áudio.
          </span>
        </label>
      </section>

      <section className="result-panel" aria-labelledby="resultado-heading">
        <div>
          <p className="eyebrow">Resultado</p>
          <h2 id="resultado-heading">
            {resultUrl ? "Sua nova gravação está pronta" : "Pronto para criar?"}
          </h2>
          <p>
            {resultUrl
              ? "Ouça o resultado abaixo e baixe o arquivo em WAV."
              : "O primeiro uso baixa o modelo local e pode levar alguns minutos."}
          </p>
        </div>

        {resultUrl ? (
          <div className="result-audio">
            <audio
              aria-label="Ouvir áudio gerado"
              controls
              autoPlay
              preload="metadata"
              src={resultUrl}
            >
              Seu navegador não consegue reproduzir o áudio gerado.
            </audio>
            <div className="result-actions">
              <a
                className="download-button"
                href={resultUrl}
                download="minha-voz-em-portugues.wav"
              >
                <DownloadIcon />
                Baixar áudio WAV
              </a>
              <button className="regenerate-button" type="submit">
                <SparkIcon />
                Gerar novamente
              </button>
            </div>
          </div>
        ) : (
          <button
            className="synthesize-button"
            type="submit"
            disabled={isSynthesizing || isRecording}
          >
            {isSynthesizing ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <SparkIcon />
            )}
            {isSynthesizing ? "Criando sua voz…" : "Gerar áudio com minha voz"}
          </button>
        )}
      </section>

      <div className="feedback-region" aria-live="polite" aria-atomic="true">
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        {successMessage ? (
          <p className="success-message" role="status">
            <CheckIcon />
            {successMessage}
          </p>
        ) : null}
      </div>

      <p className="responsibility-note">
        Use somente a sua voz ou uma voz com autorização explícita. Todo áudio
        gerado recebe uma marca-d’água digital do modelo.
      </p>
    </form>
  );
}
