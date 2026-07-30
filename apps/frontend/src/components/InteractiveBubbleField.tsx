import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

const {
  Bodies,
  Body,
  Composite,
  Engine,
} = Matter;

const MYSTERY_ID = "__mystery__";
const CLICK_DISTANCE = 6;
const WALL_DEPTH = 120;
const SETTLE_AFTER_MS = 9_000;

export type BubbleItem = {
  id: string;
  label: string;
  imageUrl?: string;
  disabled?: boolean;
};

type MysteryBubble = {
  label: string;
  imageUrl?: string;
};

type InteractiveBubbleFieldProps = {
  items: BubbleItem[];
  mystery?: MysteryBubble;
  selectedId?: string | null;
  correctId?: string | null;
  incorrectIds?: string[];
  pendingId?: string | null;
  disabled?: boolean;
  gravityScale?: number;
  maxThrowSpeed?: number;
  variant?: "showcase" | "choices";
  ariaLabel: string;
  onSelect?: (id: string) => void;
};

type BubbleSpec = BubbleItem & {
  mystery?: boolean;
  radius: number;
};

type PlacedBubble = BubbleSpec & {
  x: number;
  y: number;
};

type PointerSample = {
  x: number;
  y: number;
  time: number;
};

type DragSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  offsetX: number;
  offsetY: number;
  dragged: boolean;
  samples: PointerSample[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hash = (value: string) => {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
};

const overlap = (candidate: PlacedBubble, placed: PlacedBubble[]) =>
  placed.some((bubble) => {
    const distance = Math.hypot(candidate.x - bubble.x, candidate.y - bubble.y);
    return distance < candidate.radius + bubble.radius + 6;
  });

function tryPlace(specs: BubbleSpec[], width: number, height: number) {
  const placed: PlacedBubble[] = [];
  const mystery = specs.find((spec) => spec.mystery);

  if (mystery) {
    placed.push({ ...mystery, x: width / 2, y: height / 2 });
  }

  for (const spec of specs.filter((candidate) => !candidate.mystery)) {
    const seed = hash(spec.id);
    let position: PlacedBubble | null = null;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const angle = (seed % 360) * (Math.PI / 180) + attempt * 2.399;
      const ring = 1 + Math.floor(attempt / 12);
      const orbit = (mystery?.radius ?? spec.radius) + spec.radius + 8 + ring * spec.radius * 0.55;
      const candidate: PlacedBubble = {
        ...spec,
        x: width / 2 + Math.cos(angle) * orbit,
        y: height / 2 + Math.sin(angle) * orbit * 0.72,
      };

      if (
        candidate.x - spec.radius >= 4 &&
        candidate.x + spec.radius <= width - 4 &&
        candidate.y - spec.radius >= 4 &&
        candidate.y + spec.radius <= height - 4 &&
        !overlap(candidate, placed)
      ) {
        position = candidate;
        break;
      }
    }

    if (!position) {
      const step = Math.max(12, spec.radius * 0.45);
      for (let y = spec.radius + 4; y <= height - spec.radius - 4 && !position; y += step) {
        for (let x = spec.radius + 4; x <= width - spec.radius - 4; x += step) {
          const candidate = { ...spec, x, y };
          if (!overlap(candidate, placed)) {
            position = candidate;
            break;
          }
        }
      }
    }

    if (!position) return null;
    placed.push(position);
  }

  return placed;
}

function createLayout(items: BubbleItem[], mystery: MysteryBubble | undefined, width: number, height: number) {
  const shortSide = Math.min(width, height);
  const baseRadius = clamp(shortSide * 0.105, 34, 52);
  const sizeSteps = [1.08, 0.92, 1, 0.96, 1.12, 0.9, 1.04, 0.94, 1.06, 0.9];

  for (let scale = 1; scale >= 0.7; scale -= 0.05) {
    const specs: BubbleSpec[] = [
      ...(mystery
        ? [{
            id: MYSTERY_ID,
            label: mystery.label,
            imageUrl: mystery.imageUrl,
            mystery: true,
            radius: clamp(baseRadius * 1.45 * scale, 50, 76),
          }]
        : []),
      ...items.map((item, index) => ({
        ...item,
        radius: Math.max(24, baseRadius * sizeSteps[index % sizeSteps.length] * scale),
      })),
    ];
    const layout = tryPlace(specs, width, height);
    if (layout) return layout;
  }

  return [];
}

export function InteractiveBubbleField({
  items,
  mystery,
  selectedId = null,
  correctId = null,
  incorrectIds = [],
  pendingId = null,
  disabled = false,
  gravityScale = 0,
  maxThrowSpeed = 14,
  variant = "choices",
  ariaLabel,
  onSelect,
}: InteractiveBubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef(new Map<string, Matter.Body>());
  const radiiRef = useRef(new Map<string, number>());
  const bubbleRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<DragSession | null>(null);
  const onSelectRef = useRef(onSelect);
  const lastActivityRef = useRef(performance.now());
  const reducedMotionRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  onSelectRef.current = onSelect;

  const itemSignature = [
    ...items.map((item) => `${item.id}:${item.label}:${item.imageUrl ?? ""}`),
    mystery ? `${MYSTERY_ID}:${mystery.label}:${mystery.imageUrl ?? ""}` : "",
  ].join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = Engine.create({ enableSleeping: false });
    engine.gravity.x = 0;
    engine.gravity.y = gravityScale > 0 ? 1 : 0;
    engine.gravity.scale = gravityScale;

    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery?.matches ?? false;
      if (reducedMotionRef.current) {
        bodiesRef.current.forEach((body) => {
          Body.setVelocity(body, {
            x: body.velocity.x * 0.2,
            y: body.velocity.y * 0.2,
          });
        });
      }
    };
    syncMotionPreference();
    motionQuery?.addEventListener("change", syncMotionPreference);

    const rebuildWorld = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;

      Composite.clear(engine.world, false, true);
      bodiesRef.current.clear();
      radiiRef.current.clear();

      const layout = createLayout(items, mystery, width, height);
      const walls = [
        Bodies.rectangle(width / 2, -WALL_DEPTH / 2, width + WALL_DEPTH * 2, WALL_DEPTH, { isStatic: true }),
        Bodies.rectangle(width / 2, height + WALL_DEPTH / 2, width + WALL_DEPTH * 2, WALL_DEPTH, { isStatic: true }),
        Bodies.rectangle(-WALL_DEPTH / 2, height / 2, WALL_DEPTH, height + WALL_DEPTH * 2, { isStatic: true }),
        Bodies.rectangle(width + WALL_DEPTH / 2, height / 2, WALL_DEPTH, height + WALL_DEPTH * 2, { isStatic: true }),
      ];

      const bodies = layout.map((bubble) => {
        const body = Bodies.circle(bubble.x, bubble.y, bubble.radius, {
          label: bubble.id,
          restitution: 0.75,
          friction: 0.02,
          frictionAir: 0.025,
          density: 0.002,
          slop: 0.01,
        });
        bodiesRef.current.set(bubble.id, body);
        radiiRef.current.set(bubble.id, bubble.radius);
        const element = bubbleRefs.current.get(bubble.id);
        if (element) {
          const diameter = bubble.radius * 2;
          element.style.width = `${diameter}px`;
          element.style.height = `${diameter}px`;
        }
        return body;
      });

      Composite.add(engine.world, [...walls, ...bodies]);
    };

    let resizeFrame = 0;
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            rebuildWorld(entry.contentRect.width, entry.contentRect.height);
          });
        })
      : null;
    if (resizeObserver) {
      resizeObserver.observe(container);
    } else {
      const bounds = container.getBoundingClientRect();
      rebuildWorld(bounds.width, bounds.height);
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    const animate = (time: number) => {
      const delta = Math.min(time - previousTime, 32);
      previousTime = time;

      const driftLife = clamp(1 - (time - lastActivityRef.current) / SETTLE_AFTER_MS, 0, 1);
      if (!reducedMotionRef.current && driftLife > 0) {
        bodiesRef.current.forEach((body, id) => {
          if (body.isStatic || body.speed > 1.2) return;
          const phase = time * 0.00035 + (hash(id) % 360);
          const strength = body.mass * 0.0000018 * driftLife;
          Body.applyForce(body, body.position, {
            x: Math.cos(phase) * strength,
            y: Math.sin(phase * 0.83) * strength,
          });
        });
      }

      Engine.update(engine, delta);
      bodiesRef.current.forEach((body, id) => {
        const element = bubbleRefs.current.get(id);
        const radius = radiiRef.current.get(id);
        if (!element || !radius) return;
        element.style.transform = `translate3d(${body.position.x - radius}px, ${body.position.y - radius}px, 0)`;
      });
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      motionQuery?.removeEventListener("change", syncMotionPreference);
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
      bodiesRef.current.clear();
      radiiRef.current.clear();
    };
  }, [gravityScale, itemSignature]);

  const select = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (id === MYSTERY_ID || disabled || item?.disabled) return;
    onSelectRef.current?.(id);
  };

  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (disabled) return;
    const body = bodiesRef.current.get(id);
    const radius = radiiRef.current.get(id);
    const container = containerRef.current;
    if (!body || !radius || !container) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const now = performance.now();

    Body.setStatic(body, true);
    Body.setVelocity(body, { x: 0, y: 0 });
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      offsetX: body.position.x - x,
      offsetY: body.position.y - y,
      dragged: false,
      samples: [{ x: event.clientX, y: event.clientY, time: now }],
    };
    lastActivityRef.current = now;
    setDraggingId(id);
  };

  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container) return;
    const body = bodiesRef.current.get(drag.id);
    const radius = radiiRef.current.get(drag.id);
    if (!body || !radius) return;

    event.preventDefault();
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > CLICK_DISTANCE) drag.dragged = true;

    const bounds = container.getBoundingClientRect();
    Body.setPosition(body, {
      x: clamp(event.clientX - bounds.left + drag.offsetX, radius, bounds.width - radius),
      y: clamp(event.clientY - bounds.top + drag.offsetY, radius, bounds.height - radius),
    });

    const now = performance.now();
    drag.samples.push({ x: event.clientX, y: event.clientY, time: now });
    drag.samples = drag.samples.filter((sample) => now - sample.time <= 140);
    lastActivityRef.current = now;
  };

  const finishPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const body = bodiesRef.current.get(drag.id);
    if (body) {
      Body.setStatic(body, false);
      const samples = drag.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = Math.max(last.time - first.time, 16);
      const motionFactor = reducedMotionRef.current ? 0.2 : 1;
      const velocity = {
        x: ((last.x - first.x) / elapsed) * 16.667 * motionFactor,
        y: ((last.y - first.y) / elapsed) * 16.667 * motionFactor,
      };
      const speed = Math.hypot(velocity.x, velocity.y);
      const cap = reducedMotionRef.current ? maxThrowSpeed * 0.25 : maxThrowSpeed;
      if (speed > cap) {
        velocity.x *= cap / speed;
        velocity.y *= cap / speed;
      }
      Body.setVelocity(body, cancelled ? { x: 0, y: 0 } : velocity);
    }

    if (!cancelled && !drag.dragged) select(drag.id);
    lastActivityRef.current = performance.now();
    dragRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const bubbles: BubbleItem[] = [
    ...(mystery
      ? [{ id: MYSTERY_ID, label: mystery.label, imageUrl: mystery.imageUrl }]
      : []),
    ...items,
  ];

  return (
    <div
      ref={containerRef}
      className="bubble-field"
      data-variant={variant}
      aria-label={ariaLabel}
    >
      {bubbles.map((bubble) => {
        const isMystery = bubble.id === MYSTERY_ID;
        const item = items.find((candidate) => candidate.id === bubble.id);
        const unavailable = disabled || !!item?.disabled;
        const state =
          correctId === bubble.id
            ? "success"
            : incorrectIds.includes(bubble.id)
              ? "error"
              : pendingId === bubble.id
                ? "loading"
                : selectedId === bubble.id
                  ? "selected"
                  : undefined;

        return (
          <button
            key={bubble.id}
            ref={(element) => {
              if (element) bubbleRefs.current.set(bubble.id, element);
              else bubbleRefs.current.delete(bubble.id);
            }}
            type="button"
            className="bubble-field__bubble"
            data-mystery={isMystery || undefined}
            data-dragging={draggingId === bubble.id || undefined}
            data-state={state}
            disabled={unavailable}
            aria-pressed={!isMystery ? selectedId === bubble.id : undefined}
            aria-label={isMystery ? `Mystery bubble: ${bubble.label}` : bubble.label}
            onPointerDown={(event) => pointerDown(event, bubble.id)}
            onPointerMove={pointerMove}
            onPointerUp={(event) => finishPointer(event)}
            onPointerCancel={(event) => finishPointer(event, true)}
            onClick={(event) => {
              if (event.detail === 0 || !bodiesRef.current.has(bubble.id)) select(bubble.id);
            }}
          >
            <span className="bubble-field__disc">
              {bubble.imageUrl ? (
                <img src={bubble.imageUrl} alt="" draggable={false} />
              ) : (
                <span className={isMystery ? "bubble-field__question" : "bubble-field__name"}>
                  {isMystery ? "?" : bubble.label}
                </span>
              )}
              {state === "success" && <span className="bubble-field__status">Correct</span>}
              {state === "error" && <span className="bubble-field__status">Guessed</span>}
              {state === "loading" && <span className="bubble-field__status">Checking</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
