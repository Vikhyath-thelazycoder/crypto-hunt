import { ParchmentPanel, StateWord } from "@/components/ui";

export default function Home() {
  return (
    <main className="ch-paper flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-4 text-center">
        <StateWord>Unrolling the map</StateWord>
        <h1 className="m-0 font-display text-5xl leading-none font-normal">Crypto Hunt</h1>
        <ParchmentPanel label="About" className="w-full px-5 py-4 text-[17px] leading-relaxed text-sepia-ink">
          The hunt opens soon. Your captain will hand your crew its code.
        </ParchmentPanel>
      </div>
    </main>
  );
}
