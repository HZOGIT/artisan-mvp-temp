import type { FeedbackInput } from "../domain/feedback";

export interface IFeedbackSink {
  submit(input: FeedbackInput): Promise<{ ok: boolean }>;
}

export const noopFeedbackSink: IFeedbackSink = {
  submit: async () => ({ ok: false }),
};
