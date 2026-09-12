import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  MAX_TEXT_LENGTH,
  validateAudio,
  validateText,
} from "./synthesis";

describe("validação da síntese", () => {
  it("aceita texto em português e uma amostra WAV", () => {
    const audio = new File(["RIFF----WAVE"], "minha-voz.wav", {
      type: "audio/wav",
    });

    expect(validateText("Olá! Esta é a minha própria voz.")).toBeNull();
    expect(validateAudio(audio)).toBeNull();
  });

  it("apresenta mensagens de texto em português", () => {
    expect(validateText("")).toBe(
      "Escreva o texto em português do Brasil que você quer ouvir.",
    );
    expect(validateText("1234")).toBe(
      "O texto precisa incluir pelo menos uma palavra em português.",
    );
    expect(validateText("a".repeat(MAX_TEXT_LENGTH + 1))).toBe(
      `O texto pode ter no máximo ${MAX_TEXT_LENGTH} caracteres.`,
    );
  });

  it("rejeita formatos e tamanhos de áudio inseguros", () => {
    const invalidType = new File(["texto"], "voz.txt", {
      type: "text/plain",
    });
    const oversized = new File(
      [new Uint8Array(MAX_AUDIO_BYTES + 1)],
      "voz.wav",
      { type: "audio/wav" },
    );

    expect(validateAudio(invalidType)).toBe(
      "Use uma gravação WAV, MP3, M4A, WebM, OGG ou FLAC.",
    );
    expect(validateAudio(oversized)).toBe(
      "A gravação pode ter no máximo 15 MB.",
    );
  });
});
