import Image from "next/image";

/**
 * Confirmly brand mark — using transparent official shield checkmark asset.
 */
export function ConfirmlyMark({ className = "h-7 w-7 sm:h-8 sm:w-8" }: { className?: string }) {
  return (
    <Image
      src="/confirmly-mark.png"
      alt="Confirmly"
      width={120}
      height={120}
      className={`object-contain ${className}`}
      priority
    />
  );
}

/**
 * Confirmly full logo — balanced sizing to fit seamlessly with navigation.
 */
export function ConfirmlyLogo({
  className = "",
  tone = "light",
  markClassName = "h-7 w-7 sm:h-8 sm:w-8",
}: {
  className?: string;
  tone?: "light" | "dark";
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ConfirmlyMark className={markClassName} />
      <span
        className={`text-lg sm:text-[1.3rem] font-extrabold tracking-tight font-heading leading-none ${
          tone === "dark" ? "text-white" : "text-[#111827]"
        }`}
      >
        Conf<span className="relative">i<span className="absolute -top-[0.16em] left-1/2 h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-[#17c19a]" aria-hidden="true" /></span>rmly
      </span>
    </span>
  );
}

