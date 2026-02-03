import { Construction } from "lucide-react";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <Construction className="w-16 h-16 text-blue-500 mb-4" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-500 mt-2">Cette fonctionnalité sera bientôt disponible.</p>
    </div>
  );
}
