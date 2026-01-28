import { createContext, useContext, useState, ReactNode } from "react";

interface ModalContextType {
  isCreateClientModalOpen: boolean;
  openCreateClientModal: () => void;
  closeCreateClientModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);

  const openCreateClientModal = () => {
    console.log("✅ openCreateClientModal called");
    setIsCreateClientModalOpen(true);
  };

  const closeCreateClientModal = () => {
    console.log("❌ closeCreateClientModal called");
    setIsCreateClientModalOpen(false);
  };

  return (
    <ModalContext.Provider
      value={{
        isCreateClientModalOpen,
        openCreateClientModal,
        closeCreateClientModal,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}
