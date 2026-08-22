"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  defaultValue?: string;
  onChange?: (time: string) => void;
  className?: string;
}

export type TimerMode = "work" | "short" | "long";

export interface UnifiedTimePickerProps {
  workDuration: number;
  shortDuration: number;
  longDuration: number;
  onWorkChange: (val: number) => void;
  onShortChange: (val: number) => void;
  onLongChange: (val: number) => void;
  activeMode: TimerMode;
  onActiveModeChange: (mode: TimerMode) => void;
  className?: string;
}

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians)),
  };
};

const describeArc = (x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) => {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z",
  ].join(" ");
};

interface Wedge {
  label: string;
  val: number;
  type: 'set' | 'add';
  mode: TimerMode;
  start: number;
  end: number;
}

const WEDGES: Wedge[] = [
  // Work Mode (0 - 120)
  { label: '-5m', val: -5, type: 'add', mode: 'work', start: 0, end: 40 },
  { label: '25m', val: 25, type: 'set', mode: 'work', start: 40, end: 80 },
  { label: '+5m', val: 5, type: 'add', mode: 'work', start: 80, end: 120 },
  // Short Break Mode (120 - 240)
  { label: '-1m', val: -1, type: 'add', mode: 'short', start: 120, end: 160 },
  { label: '5m', val: 5, type: 'set', mode: 'short', start: 160, end: 200 },
  { label: '+1m', val: 1, type: 'add', mode: 'short', start: 200, end: 240 },
  // Long Break Mode (240 - 360)
  { label: '-5m', val: -5, type: 'add', mode: 'long', start: 240, end: 280 },
  { label: '15m', val: 15, type: 'set', mode: 'long', start: 280, end: 320 },
  { label: '+5m', val: 5, type: 'add', mode: 'long', start: 320, end: 360 },
];

const SVG_SIZE = 360;
const CENTER = SVG_SIZE / 2;
const INNER_RADIUS = 90;
const OUTER_RADIUS = 160;

export const UnifiedTimeWheelPicker: React.FC<UnifiedTimePickerProps> = ({
  workDuration,
  shortDuration,
  longDuration,
  onWorkChange,
  onShortChange,
  onLongChange,
  activeMode,
  onActiveModeChange,
  className
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const getCurrentVal = () => {
    if (activeMode === 'work') return workDuration ?? 25;
    if (activeMode === 'short') return shortDuration ?? 5;
    return longDuration ?? 15;
  };

  useEffect(() => {
    if (!isFocused) {
      setInputValue(getCurrentVal().toString());
    }
  }, [activeMode, workDuration, shortDuration, longDuration, isFocused]);

  const handleAdjust = (wedge: Wedge) => {
    if (activeMode !== wedge.mode) {
      onActiveModeChange(wedge.mode);
      return; // Require a second click to actually change the time
    }

    let current = 0;
    let setter = (v: number) => {};

    if (wedge.mode === 'work') { current = workDuration; setter = onWorkChange; }
    else if (wedge.mode === 'short') { current = shortDuration; setter = onShortChange; }
    else if (wedge.mode === 'long') { current = longDuration; setter = onLongChange; }

    if (wedge.type === 'set') {
      setter(wedge.val);
    } else {
      setter(Math.max(1, current + wedge.val));
    }
  };

  const handleInputCommit = () => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      if (activeMode === 'work') onWorkChange(parsed);
      else if (activeMode === 'short') onShortChange(parsed);
      else onLongChange(parsed);
    } else {
      setInputValue(getCurrentVal().toString());
    }
  };

  const showMenu = isHovered && !isFocused;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-full max-w-[360px] aspect-square transition-all duration-300",
        showMenu ? "z-50" : "z-10",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dynamic Ambient Glow - Crossfade Opacity approach for smooth transitions */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mix-blend-screen z-0 animate-[pulse_4s_ease-in-out_infinite] will-change-[opacity]">
        <div 
          className={cn(
            "absolute rounded-full w-[250px] h-[250px] transition-opacity duration-700 ease-in-out will-change-[opacity]",
            activeMode === 'work' ? "opacity-40" : "opacity-0"
          )}
          style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 1) 0%, rgba(124, 58, 237, 0) 70%)' }}
        />
        <div 
          className={cn(
            "absolute rounded-full w-[250px] h-[250px] transition-opacity duration-700 ease-in-out will-change-[opacity]",
            activeMode === 'short' ? "opacity-40" : "opacity-0"
          )}
          style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 1) 0%, rgba(59, 130, 246, 0) 70%)' }}
        />
        <div 
          className={cn(
            "absolute rounded-full w-[250px] h-[250px] transition-opacity duration-700 ease-in-out will-change-[opacity]",
            activeMode === 'long' ? "opacity-40" : "opacity-0"
          )}
          style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 1) 0%, rgba(168, 85, 247, 0) 70%)' }}
        />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <AnimatePresence>
          <motion.svg
            initial={{ opacity: 0, scale: 0.8, rotate: -15 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.8, rotate: 15 }}
                transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
                width="100%"
                height="100%"
                viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
                className="drop-shadow-xl"
              >
                {/* Subtle Inner Section Labels (Rotated to match curve) */}
                <text x={polarToCartesian(CENTER, CENTER, 75, 60).x} y={polarToCartesian(CENTER, CENTER, 75, 60).y} transform={`rotate(60, ${polarToCartesian(CENTER, CENTER, 75, 60).x}, ${polarToCartesian(CENTER, CENTER, 75, 60).y})`} textAnchor="middle" dominantBaseline="central" className="text-[9px] uppercase tracking-[0.2em] font-bold fill-primary/30 dark:fill-primary/30 pointer-events-none select-none">WORK</text>
                <text x={polarToCartesian(CENTER, CENTER, 75, 180).x} y={polarToCartesian(CENTER, CENTER, 75, 180).y} transform={`rotate(0, ${polarToCartesian(CENTER, CENTER, 75, 180).x}, ${polarToCartesian(CENTER, CENTER, 75, 180).y})`} textAnchor="middle" dominantBaseline="central" className="text-[9px] uppercase tracking-[0.2em] font-bold fill-blue-500/30 dark:fill-blue-500/30 pointer-events-none select-none">SHORT</text>
                <text x={polarToCartesian(CENTER, CENTER, 75, 300).x} y={polarToCartesian(CENTER, CENTER, 75, 300).y} transform={`rotate(-60, ${polarToCartesian(CENTER, CENTER, 75, 300).x}, ${polarToCartesian(CENTER, CENTER, 75, 300).y})`} textAnchor="middle" dominantBaseline="central" className="text-[9px] uppercase tracking-[0.2em] font-bold fill-purple-500/30 dark:fill-purple-500/30 pointer-events-none select-none">LONG</text>

                {WEDGES.map((wedge, index) => {
                const isSet = wedge.type === 'set';
                const isActiveMode = activeMode === wedge.mode;
                
                // Make the 'set' wedge bulge out slightly (crown effect)
                const currentOuterRadius = isSet ? OUTER_RADIUS + 8 : OUTER_RADIUS;
                
                const pathData = describeArc(CENTER, CENTER, INNER_RADIUS, currentOuterRadius, wedge.start, wedge.end);
                const centerAngle = wedge.start + (wedge.end - wedge.start) / 2;
                const textPos = polarToCartesian(CENTER, CENTER, (INNER_RADIUS + currentOuterRadius) / 2, centerAngle);

                const hoverOffset = polarToCartesian(0, 0, 4, centerAngle);
                const tapOffset = polarToCartesian(0, 0, 1, centerAngle);

                let baseFill = "";
                let textFill = "";
                
                if (isActiveMode) {
                  if (wedge.mode === 'work') {
                    baseFill = isSet ? "fill-primary/30 dark:fill-primary/40" : "fill-primary/10 dark:fill-primary/10";
                    textFill = "fill-primary dark:fill-primary";
                  } else if (wedge.mode === 'short') {
                    baseFill = isSet ? "fill-blue-500/30 dark:fill-blue-500/40" : "fill-blue-500/10 dark:fill-blue-500/10";
                    textFill = "fill-blue-600 dark:fill-blue-400";
                  } else if (wedge.mode === 'long') {
                    baseFill = isSet ? "fill-purple-500/30 dark:fill-purple-500/40" : "fill-purple-500/10 dark:fill-purple-500/10";
                    textFill = "fill-purple-600 dark:fill-purple-400";
                  }
                } else {
                  // Inactive subtle tinted state
                  if (wedge.mode === 'work') {
                    baseFill = isSet ? "fill-primary/10 dark:fill-primary/5" : "fill-primary/5 dark:fill-primary/[0.02]";
                    textFill = "fill-slate-700 dark:fill-primary/30";
                  } else if (wedge.mode === 'short') {
                    baseFill = isSet ? "fill-blue-500/10 dark:fill-blue-500/5" : "fill-blue-500/5 dark:fill-blue-500/[0.02]";
                    textFill = "fill-slate-700 dark:fill-blue-400/30";
                  } else if (wedge.mode === 'long') {
                    baseFill = isSet ? "fill-purple-500/10 dark:fill-purple-500/5" : "fill-purple-500/5 dark:fill-purple-500/[0.02]";
                    textFill = "fill-slate-700 dark:fill-purple-400/30";
                  }
                }

                return (
                  <motion.g
                    key={index}
                    className="pointer-events-auto"
                    style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                    whileHover={{ x: hoverOffset.x, y: hoverOffset.y }}
                    whileTap={{ x: tapOffset.x, y: tapOffset.y, transition: { duration: 0.05 } }}
                  >
                    <motion.path
                      d={pathData}
                      style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                      whileTap={{ scale: 0.98, transition: { duration: 0.05 } }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleAdjust(wedge)}
                      className={cn(
                        "stroke-white stroke-[3px] transition-colors duration-150 cursor-pointer dark:stroke-zinc-950",
                        baseFill,
                        isActiveMode ? "hover:brightness-110" : "hover:fill-slate-200 dark:hover:fill-zinc-700"
                      )}
                    />
                    <text
                      x={textPos.x}
                      y={textPos.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={cn(
                        "font-bold pointer-events-none select-none",
                        isSet ? "text-[18px] tracking-tight" : "text-[12px] opacity-70",
                        textFill
                      )}
                    >
                      {wedge.label}
                    </text>
                  </motion.g>
                );
              })}
            </motion.svg>
        </AnimatePresence>
      </div>

      <div className={cn(
        "relative bg-white dark:bg-zinc-950 rounded-full px-5 py-3 z-20 shadow-md transition-all ring-1 focus-within:shadow-xl focus-within:ring-2",
        activeMode === 'work' ? "ring-primary/50 dark:ring-primary/50" : 
        activeMode === 'short' ? "ring-blue-500/50 dark:ring-blue-500/50" : 
        "ring-purple-500/50 dark:ring-purple-500/50"
      )}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          onFocus={(e) => {
            setIsFocused(true);
            e.target.select();
          }}
          onBlur={(e) => {
            setIsFocused(false);
            handleInputCommit();
          }}
          placeholder="Min"
          className={cn(
            "w-20 text-3xl font-bold bg-transparent outline-none text-center tracking-tight",
            activeMode === 'work' ? "text-primary dark:text-primary" : 
            activeMode === 'short' ? "text-blue-600 dark:text-blue-400" : 
            "text-purple-600 dark:text-purple-400"
          )}
        />
        <div className="text-xs uppercase font-bold text-muted-foreground/70 text-center mt-0.5 tracking-widest">
          {activeMode === 'work' ? 'Work' : activeMode === 'short' ? 'Short' : 'Long'}
        </div>
      </div>
    </div>
  );
};
