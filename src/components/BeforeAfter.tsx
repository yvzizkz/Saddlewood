"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface CompareSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeAlt?: string;
  afterAlt?: string;
}

function CompareSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Before",
  afterLabel = "After",
  beforeAlt = "Before renovation",
  afterAlt = "After renovation",
}: CompareSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percent);
  }, []);

  const handleMouseDown = () => {
    isDragging.current = true;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    let newPos = sliderPos;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        newPos = Math.max(0, sliderPos - 2);
        break;
      case "ArrowRight":
        e.preventDefault();
        newPos = Math.min(100, sliderPos + 2);
        break;
      case "Home":
        e.preventDefault();
        newPos = 0;
        break;
      case "End":
        e.preventDefault();
        newPos = 100;
        break;
      default:
        return;
    }
    setSliderPos(newPos);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[400px] sm:h-[500px] rounded-2xl overflow-hidden cursor-col-resize select-none shadow-xl"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
    >
      {/* After Image (full width behind) */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-teal-dark"
        style={{ backgroundImage: `url('${afterImage}')` }}
        role="img"
        aria-label={afterAlt}
      />

      {/* Before Image (clipped) */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-teal"
        style={{
          backgroundImage: `url('${beforeImage}')`,
          clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
        }}
        role="img"
        aria-label={beforeAlt}
      />

      {/* Slider Line — keyboard accessible */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
        style={{ left: `${sliderPos}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        role="slider"
        aria-label="Compare before and after images"
        aria-valuenow={Math.round(sliderPos)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`Showing ${Math.round(sliderPos)}% before, ${Math.round(100 - sliderPos)}% after`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing">
          <svg
            className="w-5 h-5 text-teal"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 bg-teal-dark/80 text-stone text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm" aria-hidden="true">
        {beforeLabel}
      </div>
      <div className="absolute top-4 right-4 bg-gold/90 text-teal-dark text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm" aria-hidden="true">
        {afterLabel}
      </div>
    </div>
  );
}

const transformations = [
  {
    before: "/images/before-kitchen-1.jpg",
    after: "/images/after-kitchen-1.jpg",
    title: "McCormick Ranch Kitchen",
    description: "Complete kitchen transformation with custom island and quartz countertops",
    beforeAlt: "McCormick Ranch kitchen before renovation — dated cabinets and countertops",
    afterAlt: "McCormick Ranch kitchen after renovation — custom island with quartz countertops",
  },
  {
    before: "/images/before-bathroom-1.jpg",
    after: "/images/after-bathroom-1.jpg",
    title: "Gainey Ranch Master Bath",
    description: "Luxurious spa-inspired bathroom with walk-in shower and freestanding tub",
    beforeAlt: "Gainey Ranch master bathroom before renovation",
    afterAlt: "Gainey Ranch master bathroom after renovation — spa-inspired with freestanding tub",
  },
];

export function BeforeAfter() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-gold-accessible text-sm tracking-[0.2em] uppercase font-medium">
            Transformations
          </span>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-teal mt-3 mb-4">
            See the Difference
          </h2>
          <p className="text-charcoal/60 max-w-2xl mx-auto">
            Drag the slider or use arrow keys to reveal stunning before and after
            transformations from our recent projects.
          </p>
        </motion.div>

        {/* Compare Sliders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {transformations.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            >
              <CompareSlider
                beforeImage={t.before}
                afterImage={t.after}
                beforeAlt={t.beforeAlt}
                afterAlt={t.afterAlt}
              />
              <div className="mt-4">
                <h3 className="font-heading text-xl font-bold text-teal">
                  {t.title}
                </h3>
                <p className="text-sm text-charcoal/60 mt-1">
                  {t.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
