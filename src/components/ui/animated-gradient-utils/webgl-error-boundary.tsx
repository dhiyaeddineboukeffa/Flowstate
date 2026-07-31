"use client";

import React from "react";
import { cn } from "@/lib/utils";

export class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function WebGLFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-gradient-to-br from-background to-background/50",
        className
      )}
    />
  );
}
