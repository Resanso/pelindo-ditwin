import Image from "next/image";
import ThreeViewerClient from "./ThreeViewerClient";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-5xl flex-col items-center justify-start py-12 px-6 bg-white dark:bg-black sm:items-start">
        <div className="w-full max-w-3xl">
          <h1 className="mt-6 text-2xl font-semibold text-black dark:text-zinc-50">
            Pelindo 3D Demo
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Interactive Three.js viewer (client-side).
          </p>
        </div>

        <section className="mt-6 w-full max-w-4xl">
          <ThreeViewerClient />
        </section>
      </main>
    </div>
  );
}
