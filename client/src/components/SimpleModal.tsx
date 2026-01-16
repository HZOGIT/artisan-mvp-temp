import { useState, useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface SimpleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function SimpleModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: SimpleModalProps) {
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  
  // Délai pour que l'overlay ne soit pas actif au premier rendu
  useEffect(() => {
    if (isOpen) {
      setIsOverlayActive(false);
      const timer = setTimeout(() => setIsOverlayActive(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsOverlayActive(false);
    }
  }, [isOpen]);
  
  console.log('🎬 SimpleModal render, isOpen:', isOpen);
  
  if (!isOpen) {
    console.log('🚫 SimpleModal not rendering (isOpen=false)');
    return null;
  }
  
  console.log('✅ SimpleModal rendering (isOpen=true)');

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => {
          if (isOverlayActive) {
            console.log('🖱️ Overlay clicked, calling onClose');
            onClose();
          }
        }}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-background rounded-lg border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                console.log('❌ Close button clicked, calling onClose');
                onClose();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">{children}</div>

          {/* Footer */}
          {footer && <div className="p-6 border-t flex gap-2 justify-end">{footer}</div>}
        </div>
      </div>
    </>
  );
}
