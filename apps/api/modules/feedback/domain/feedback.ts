export interface FeedbackInput {
  type: "bug" | "suggestion";
  message: string;
  page?: string;
  email: string;
}
