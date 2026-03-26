"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const styles = `
  @keyframes corner-slide-in {
    0%   { opacity: 0; transform: translateX(-120px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes un-two-zero-roll-in {
    0%   { opacity: 0;   transform: translateX(-60px) rotate(-360deg) scale(0.3); }
    70%  { opacity: 0.8; transform: translateX(0)     rotate(0deg)    scale(1.1); }
    100% { opacity: 1;   transform: translateX(0)     rotate(0deg)    scale(1);   }
  }
  .corner-slide-hidden   { opacity: 0; transform: translateX(-120px); }
  .corner-slide-entrance { animation: corner-slide-in 0.8s ease-out 0s forwards; opacity: 0; }
  .un-two-zero-roll-hidden   { opacity: 0; transform: translateX(-60px) rotate(-360deg) scale(0.3); }
  .un-two-zero-roll-entrance { animation: un-two-zero-roll-in 1s ease-out 0s forwards; opacity: 0; }
`;

export function AnimatedCornerLogo() {
  const pathname = usePathname();

  const [cornerClass, setCornerClass] = useState("corner-slide-hidden");
  const [spriteClass, setSpriteClass] = useState("un-two-zero-roll-hidden");

  useEffect(() => {
    if (pathname !== "/") return;

    const cornerTimer = setTimeout(
      () => setCornerClass("corner-slide-entrance"),
      1500,
    );
    const spriteTimer = setTimeout(
      () => setSpriteClass("un-two-zero-roll-entrance"),
      2500,
    );

    return () => {
      clearTimeout(cornerTimer);
      clearTimeout(spriteTimer);
    };
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <>
      <style>{styles}</style>
      <a
        href="https://un-two-zero.network/"
        target="_blank"
        rel="noopener noreferrer"
        className={`fixed bottom-0 left-0 z-30 hidden cursor-pointer transition-opacity hover:opacity-80 md:block ${cornerClass}`}
        aria-label="Visit UN 2.0 Network"
      >
        <Image
          src="/images/un-two-zero-corner.svg"
          alt="UN 2.0 Corner Logo"
          width={123}
          height={123}
          className="block"
        />
        <div className="absolute inset-0 flex items-center justify-start pt-2 pl-3">
          <Image
            src="/images/un-two-zero-logo-quintets.svg"
            alt="UN 2.0 Animation"
            width={31}
            height={29}
            className={`block ${spriteClass}`}
          />
        </div>
      </a>
    </>
  );
}
