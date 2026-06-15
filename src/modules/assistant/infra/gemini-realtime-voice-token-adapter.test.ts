import { describe, it, expect } from "vitest";
import { findTool } from "../domain/assistant-tools-catalog";
import { buildAuthTokenBody } from "./gemini-realtime-voice-token-adapter";

const TOOLS = [findTool("lister_factures")!, findTool("creer_client")!];

describe("buildAuthTokenBody (pur)", () => {
  it("setup Live AUDIO + transcriptions + system instruction + function_declarations (snake_case)", () => {
    const now = new Date("2026-06-15T00:00:00.000Z").getTime();
    const body = buildAuthTokenBody({ systemText: "SYS", tools: TOOLS }, "gemini-live-x", now) as Record<string, unknown>;
    expect(body.uses).toBe(1);
    expect(body.expire_time).toBe("2026-06-15T00:30:00.000Z"); // +30 min
    expect(body.new_session_expire_time).toBe("2026-06-15T00:01:00.000Z"); // +1 min
    const setup = body.bidi_generate_content_setup as Record<string, unknown>;
    expect(setup.model).toBe("models/gemini-live-x");
    expect((setup.generation_config as { response_modalities: string[] }).response_modalities).toEqual(["AUDIO"]);
    expect(setup.input_audio_transcription).toEqual({});
    expect(setup.output_audio_transcription).toEqual({});
    expect((setup.system_instruction as { parts: { text: string }[] }).parts[0].text).toBe("SYS");
    const tools = setup.tools as Array<{ function_declarations: Array<{ name: string }> }>;
    expect(tools[0].function_declarations.map((d) => d.name)).toEqual(["lister_factures", "creer_client"]);
  });

  it("sans outil → function_declarations vide", () => {
    const body = buildAuthTokenBody({ systemText: "S", tools: [] }, "m", Date.now()) as Record<string, unknown>;
    const setup = body.bidi_generate_content_setup as Record<string, unknown>;
    expect((setup.tools as Array<{ function_declarations: unknown[] }>)[0].function_declarations).toEqual([]);
  });
});
