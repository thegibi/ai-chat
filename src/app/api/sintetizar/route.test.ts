// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const wav = new Uint8Array([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69,
]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rota de síntese", () => {
  it("encaminha o texto e retorna áudio marcado como pt-BR", async () => {
    const serviceFetch = vi.fn(
      async (_url: URL, options: RequestInit | undefined) => {
        const forwarded = options?.body as FormData;
        expect(forwarded.get("texto")).toBe(
          "Olá! Esta frase será falada em português.",
        );
        expect(forwarded.get("consentimento")).toBe("true");
        expect(forwarded.get("amostra")).toBeInstanceOf(File);

        return new Response(wav, {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        });
      },
    );
    vi.stubGlobal("fetch", serviceFetch);

    const form = new FormData();
    form.set("texto", "Olá! Esta frase será falada em português.");
    form.set(
      "amostra",
      new File([wav], "minha-voz.wav", { type: "audio/wav" }),
    );
    form.set("consentimento", "true");

    const response = await POST(
      new Request("http://localhost/api/sintetizar", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("x-synthesis-language")).toBe("pt-BR");
    expect(response.headers.get("x-audio-watermarked")).toBe("true");
    expect(serviceFetch).toHaveBeenCalledOnce();
  });

  it("exige autorização da própria voz antes do encaminhamento", async () => {
    const serviceFetch = vi.fn();
    vi.stubGlobal("fetch", serviceFetch);

    const form = new FormData();
    form.set("texto", "Olá! Esta frase será falada em português.");
    form.set(
      "amostra",
      new File([wav], "minha-voz.wav", { type: "audio/wav" }),
    );

    const response = await POST(
      new Request("http://localhost/api/sintetizar", {
        method: "POST",
        body: form,
      }),
    );
    const payload = (await response.json()) as { erro: string };

    expect(response.status).toBe(422);
    expect(payload.erro).toBe(
      "Confirme que a voz é sua e que você autoriza a síntese.",
    );
    expect(serviceFetch).not.toHaveBeenCalled();
  });
});
