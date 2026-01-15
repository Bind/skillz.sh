import { useState, useEffect, useMemo } from "react";

interface CyclingTextProps {
  words: string[];
  interval?: number;
}

export function CyclingText({ words, interval = 2500 }: CyclingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Find the longest word to set a fixed width
  const longestWord = useMemo(
    () => words.reduce((a, b) => (a.length > b.length ? a : b), ""),
    [words]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setIsVisible(false);

      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % words.length);
        setIsVisible(true);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span className="relative inline-block text-center">
      {/* Invisible spacer for fixed width */}
      <span className="invisible">{longestWord}</span>
      {/* Actual text positioned absolutely */}
      <span
        aria-live="polite"
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: isVisible ? 1 : 0 }}
      >
        {words[currentIndex]}
      </span>
    </span>
  );
}
