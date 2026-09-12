export const MAX_TEXT_LENGTH = 300;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
] as const;

export function validateText(text: string): string | null {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return "Escreva o texto em português do Brasil que você quer ouvir.";
  }

  if (normalizedText.length > MAX_TEXT_LENGTH) {
    return `O texto pode ter no máximo ${MAX_TEXT_LENGTH} caracteres.`;
  }

  if (!/\p{L}/u.test(normalizedText)) {
    return "O texto precisa incluir pelo menos uma palavra em português.";
  }

  return null;
}

export function validateAudio(file: File): string | null {
  const mediaType = file.type.toLowerCase().split(";")[0];

  if (
    mediaType &&
    !ACCEPTED_AUDIO_TYPES.includes(
      mediaType as (typeof ACCEPTED_AUDIO_TYPES)[number],
    )
  ) {
    return "Use uma gravação WAV, MP3, M4A, WebM, OGG ou FLAC.";
  }

  if (file.size === 0) {
    return "A gravação está vazia. Grave ou escolha outro arquivo.";
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return "A gravação pode ter no máximo 15 MB.";
  }

  return null;
}
