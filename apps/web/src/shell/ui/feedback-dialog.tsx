import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { trpc } from "@/shared/trpc";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FeedbackType = "bug" | "suggestion";

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { t } = useTranslation("shell");
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const submit = trpc.feedback.submit.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        setStatus("success");
        setMessage("");
      } else {
        setStatus("error");
      }
    },
    onError: () => setStatus("error"),
  });

  const handleSubmit = () => {
    if (!message.trim()) return;
    setStatus("idle");
    submit.mutate({ type, message: message.trim(), page: window.location.pathname });
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) { setStatus("idle"); setMessage(""); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("feedbackTitle")}</DialogTitle>
        </DialogHeader>

        {status === "success" ? (
          <p className="py-4 text-sm text-green-600">{t("feedbackSuccess")}</p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("feedbackType")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("feedbackTypeBug")}</SelectItem>
                  <SelectItem value="suggestion">{t("feedbackTypeSuggestion")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t("feedbackMessage")}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("feedbackMessagePlaceholder")}
                rows={4}
                maxLength={2000}
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-destructive">{t("feedbackError")}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {status === "success" ? (
            <Button onClick={() => handleOpenChange(false)}>{t("fermer")}</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!message.trim() || submit.isPending}>
              {submit.isPending ? "…" : t("feedbackSubmit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
