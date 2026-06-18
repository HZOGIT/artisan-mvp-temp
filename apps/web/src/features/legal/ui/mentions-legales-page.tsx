import { LegalPage } from "./legal-page";
import { MENTIONS_LEGALES } from "../domain/legal-content";

export default function Page() { return <LegalPage doc={MENTIONS_LEGALES} />; }
