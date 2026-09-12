import { NextResponse } from "next/server";
import {
  MAX_AUDIO_BYTES,
  validateAudio,
  validateText,
} from "@/lib/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { erro: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function synthesisServiceUrl() {
  const configuredUrl =
    process.env.TTS_SERVICE_URL?.trim() ?? "http://127.0.0.1:8000";

  try {
    return new URL("/sintetizar", `${configuredUrl.replace(/\/$/, "")}/`);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return errorResponse("O envio completo pode ter no máximo 16 MB.", 413);
  }

  let receivedForm: FormData;
  try {
    receivedForm = await request.formData();
  } catch {
    return errorResponse(
      "Não foi possível ler o texto e a gravação enviados.",
      400,
    );
  }

  const textEntry = receivedForm.get("texto");
  const audioEntry = receivedForm.get("amostra");
  const consentEntry = receivedForm.get("consentimento");

  if (typeof textEntry !== "string") {
    return errorResponse(
      "Escreva o texto em português do Brasil que você quer ouvir.",
      422,
    );
  }

  const textError = validateText(textEntry);
  if (textError) return errorResponse(textError, 422);

  if (!(audioEntry instanceof File)) {
    return errorResponse(
      "Grave ou envie uma amostra da sua própria voz.",
      422,
    );
  }

  const audioError = validateAudio(audioEntry);
  if (audioError) return errorResponse(audioError, 422);

  if (consentEntry !== "true") {
    return errorResponse(
      "Confirme que a voz é sua e que você autoriza a síntese.",
      422,
    );
  }

  const serviceUrl = synthesisServiceUrl();
  if (!serviceUrl) {
    return errorResponse(
      "O endereço do serviço local de voz não está configurado corretamente.",
      500,
    );
  }

  const forwardedForm = new FormData();
  forwardedForm.set("texto", textEntry.trim());
  forwardedForm.set("amostra", audioEntry, "amostra-de-voz");
  forwardedForm.set("consentimento", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const serviceResponse = await fetch(serviceUrl, {
      method: "POST",
      body: forwardedForm,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!serviceResponse.ok) {
      const payload = (await serviceResponse.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      const detail =
        typeof payload?.detail === "string"
          ? payload.detail
          : "O serviço local não conseguiu gerar o áudio.";
      return errorResponse(detail, serviceResponse.status);
    }

    const audio = await serviceResponse.arrayBuffer();
    if (!audio.byteLength) {
      return errorResponse("O serviço local retornou um áudio vazio.", 502);
    }

    return new Response(audio, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition":
          'attachment; filename="minha-voz-em-portugues.wav"',
        "Content-Length": audio.byteLength.toString(),
        "Content-Type": "audio/wav",
        "X-Audio-Watermarked": "true",
        "X-Content-Type-Options": "nosniff",
        "X-Synthesis-Language": "pt-BR",
      },
    });
  } catch (serviceError) {
    if (
      serviceError instanceof DOMException &&
      serviceError.name === "AbortError"
    ) {
      return errorResponse(
        "A síntese demorou mais de cinco minutos e foi interrompida.",
        504,
      );
    }

    return errorResponse(
      "O serviço local de voz está indisponível. Inicie o servidor Python e tente novamente.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
