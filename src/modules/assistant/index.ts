// Contrat public du module assistant (slice lectures threads/messages). Les générateurs IA
// (chat/generateDevis/suggestRelances/analyseRentabilite/predictionTresorerie) = slices suivantes.
export * from "./domain/assistant";
export * from "./application/assistant-threads-repository";
export * from "./application/read-use-cases";
