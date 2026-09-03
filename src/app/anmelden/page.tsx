import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { AnmeldeFormular } from "@/components/AnmeldeFormular";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Anmelden | FZT Eventmanager" };
export const dynamic = "force-dynamic";

export default async function AnmeldenSeite() {
  if (await angemeldeterBenutzer()) redirect("/");

  return (
    <div className="mx-auto max-w-sm py-12">
      <header className="mb-8 flex flex-col items-center text-center">
        <Logo hoehe={78} />
        <p className="mt-5 text-sm text-leise">
          Eventmanager, interner Zugang
        </p>
      </header>
      <AnmeldeFormular />
    </div>
  );
}
