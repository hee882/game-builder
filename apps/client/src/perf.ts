export interface PerfSnapshot {
  frameP95: number; simP95: number; renderCpuP95: number; drawCalls: number; drawCallsPeak: number; samples: number; simSamples: number;
}

/** Rolling 600 rendered frames / 600 simulation ticks, excluding hidden-tab gaps. */
export class PerformanceMeter {
  private frames: number[] = [];
  private ticks: number[] = [];
  private renders: number[] = [];
  private peakCalls = 0;
  private frameIndex = 0;
  private tickIndex = 0;
  private calls = 0;
  frame(ms: number, calls: number, renderCpuMs = 0): void {
    const index = this.frameIndex++ % 600; this.frames[index] = ms; this.renders[index] = renderCpuMs;
    this.calls = calls; this.peakCalls = Math.max(this.peakCalls, calls);
  }
  tick(ms: number): void { this.ticks[this.tickIndex++ % 600] = ms; }
  reset(): void { this.frames.length = 0; this.ticks.length = 0; this.renders.length = 0; this.peakCalls = 0; this.frameIndex = this.tickIndex = 0; }
  snapshot(): PerfSnapshot {
    const p95 = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
    return { frameP95: p95(this.frames), simP95: p95(this.ticks), renderCpuP95: p95(this.renders), drawCalls: this.calls, drawCallsPeak: this.peakCalls, samples: this.frames.length, simSamples: this.ticks.length };
  }
}
