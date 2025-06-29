import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { PlayerShip } from "./PlayerShip";
import { MapPoint } from "./MapPoint";
import { playBarrierCollisionSound } from "../../utils/soundManager";

interface GalaxyMapProps {}

interface MapPointData {
  id: string;
  x: number;
  y: number;
  name: string;
  type: "planet" | "station" | "nebula" | "asteroid";
  description: string;
  image?: string;
}

// Configuração simplificada do mundo toroidal
const WORLD_CONFIG = {
  width: 200, // Tamanho do mundo em %
  height: 200,
} as const;

// Função wrap para coordenadas toroidais
const wrap = (value: number, min: number, max: number): number => {
  const range = max - min;
  if (range <= 0) return min;

  let result = value;
  while (result < min) result += range;
  while (result >= max) result -= range;
  return result;
};

export const GalaxyMap: React.FC<GalaxyMapProps> = () => {
  const [shipPosition, setShipPosition] = useState(() => {
    const saved = localStorage.getItem("xenopets-player-data");
    const data = saved
      ? JSON.parse(saved)
      : { ship: { x: 50, y: 50 }, map: { x: 0, y: 0 } };
    console.log("💾 Dados carregados do localStorage:", { saved, data });
    return data.ship;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isColliding, setIsColliding] = useState(false);
  const [collisionNotification, setCollisionNotification] = useState<{
    show: boolean;
    id: number;
  }>({ show: false, id: 0 });

  // Estados para o modo auto-piloto
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [autoPilotDirection, setAutoPilotDirection] = useState({ x: 0, y: 0 });
  const [holdStartTime, setHoldStartTime] = useState<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });

  const mapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Motion values para posição do mapa (movimento inverso da nave)
  const getInitialMapPosition = () => {
    const saved = localStorage.getItem("xenopets-player-data");
    const data = saved
      ? JSON.parse(saved)
      : { ship: { x: 50, y: 50 }, map: { x: 0, y: 0 } };
    return data.map;
  };

  const initialMapPos = getInitialMapPosition();
  const mapX = useMotionValue(initialMapPos.x);
  const mapY = useMotionValue(initialMapPos.y);
  const shipRotation = useMotionValue(0);
  // Sistema de rotação suave
  const targetRotation = useRef(0);
  const lastRotationUpdate = useRef(0);

  // Estados para momentum/inércia
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [isDecelerating, setIsDecelerating] = useState(false);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(Date.now());
  const [hasMoved, setHasMoved] = useState(false);

  // Canvas ref para estrelas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  // Refs para auto-piloto
  const autoPilotAnimationRef = useRef<number>();
  const holdTimeoutRef = useRef<number>();

  // Sistema de estrelas cadentes
  const shootingStarsRef = useRef<
    {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
      color: string;
      tailLength: number;
      angle: number;
      startTime: number;
    }[]
  >([]);
  const lastShootingStarTime = useRef(0);

  // Sistema de estrelas corrigido para escala -5000 a +5000
  const starData = useMemo(() => {
    const colors = [
      "#60A5FA",
      "#F87171",
      "#34D399",
      "#FBBF24",
      "#A78BFA",
      "#FB7185",
    ];

    const createStar = (seed: number, layerType: "bg" | "mid" | "fg") => {
      // Função hash simples e efetiva
      const hash = (n: number) => {
        let h = n * 2654435761;
        h = h ^ (h >> 16);
        h = h * 2654435761;
        h = h ^ (h >> 16);
        return (h >>> 0) / 4294967296;
      };

      const baseConfig = {
        bg: {
          sizeMin: 0.3,
          sizeMax: 0.8,
          opacityMin: 0.1,
          opacityMax: 0.4,
          speed: 0.08,
        },
        mid: {
          sizeMin: 0.6,
          sizeMax: 1.2,
          opacityMin: 0.2,
          opacityMax: 0.6,
          speed: 0.25,
        },
        fg: {
          sizeMin: 1.0,
          sizeMax: 2.0,
          opacityMin: 0.4,
          opacityMax: 0.9,
          speed: 0.5,
        },
      }[layerType];

      // Escala real do mapa: -5000 a +5000 = 10000 unidades
      // Expandimos para 20000 unidades para ter estrelas suficientes
      const MAP_SCALE = 20000;

      return {
        x: (hash(seed * 11) - 0.5) * MAP_SCALE,
        y: (hash(seed * 13) - 0.5) * MAP_SCALE,
        size:
          baseConfig.sizeMin +
          hash(seed * 17) * (baseConfig.sizeMax - baseConfig.sizeMin),
        opacity:
          baseConfig.opacityMin +
          hash(seed * 19) * (baseConfig.opacityMax - baseConfig.opacityMin),
        color:
          layerType === "fg" && hash(seed * 23) > 0.7
            ? colors[Math.floor(hash(seed * 29) * colors.length)]
            : "#ffffff",
        speed: baseConfig.speed,
        isColorful: layerType === "fg" && hash(seed * 23) > 0.7,
      };
    };

    return {
      background: Array.from({ length: 1500 }, (_, i) =>
        createStar(i + 1000, "bg"),
      ),
      middle: Array.from({ length: 800 }, (_, i) =>
        createStar(i + 2000, "mid"),
      ),
      foreground: Array.from({ length: 300 }, (_, i) =>
        createStar(i + 3000, "fg"),
      ),
    };
  }, []);

  // Posição da nave em ref para evitar re-renders
  const shipPosRef = useRef(shipPosition);

  // Atualiza ref quando state muda
  useEffect(() => {
    shipPosRef.current = shipPosition;
  }, [shipPosition]);

  // Debug: log das posições iniciais
  useEffect(() => {
    console.log("🚀 Posição inicial da nave:", shipPosition);
    console.log("🗺️ Posição inicial do mapa:", {
      x: mapX.get(),
      y: mapY.get(),
    });
  }, []);

  // Sistema de geração de estrelas cadentes
  const createShootingStar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const colors = [
      "#60A5FA", // Blue
      "#F87171", // Red
      "#34D399", // Green
      "#FBBF24", // Yellow
      "#A78BFA", // Purple
      "#FB7185", // Pink
      "#10B981", // Emerald
      "#F59E0B", // Amber
      "#8B5CF6", // Violet
      "#06B6D4", // Cyan
    ];

    // Propriedades aleatórias para cada estrela cadente
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4; // Velocidade entre 2-6
    const size = 0.4 + Math.random() * 0.6; // Tamanho entre 0.4-1.0 (menores)
    const life = 60 + Math.random() * 120; // Vida entre 1-3 segundos a 60fps
    const tailLength = 12 + Math.random() * 18; // Comprimento da cauda (reduzido)

    // Posição inicial fora da tela
    const margin = 100;
    let startX, startY;

    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // Top
        startX = Math.random() * (canvas.width + 2 * margin) - margin;
        startY = -margin;
        break;
      case 1: // Right
        startX = canvas.width + margin;
        startY = Math.random() * (canvas.height + 2 * margin) - margin;
        break;
      case 2: // Bottom
        startX = Math.random() * (canvas.width + 2 * margin) - margin;
        startY = canvas.height + margin;
        break;
      default: // Left
        startX = -margin;
        startY = Math.random() * (canvas.height + 2 * margin) - margin;
        break;
    }

    return {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: life,
      maxLife: life,
      size: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      tailLength: tailLength,
      angle: angle,
      startTime: Date.now(),
    };
  }, []);

  const updateShootingStars = useCallback(
    (currentTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Gera novas estrelas cadentes ocasionalmente
      if (
        currentTime - lastShootingStarTime.current >
        2000 + Math.random() * 4000
      ) {
        const newStar = createShootingStar();
        if (newStar) {
          shootingStarsRef.current.push(newStar);
          lastShootingStarTime.current = currentTime;
        }
      }

      // Atualiza estrelas cadentes existentes
      shootingStarsRef.current = shootingStarsRef.current.filter((star) => {
        // Animação baseada em seno para movimento fluido
        const timeDelta = (currentTime - star.startTime) * 0.001; // Converte para segundos
        const sineWave = Math.sin(timeDelta * 3) * 0.3; // Ondulação suave

        // Aplica movimento com ondulação
        star.x += star.vx + sineWave * Math.cos(star.angle + Math.PI / 2);
        star.y += star.vy + sineWave * Math.sin(star.angle + Math.PI / 2);

        star.life--;

        // Remove estrelas que saíram da tela ou acabou a vida
        return (
          star.life > 0 &&
          star.x > -200 &&
          star.x < canvas.width + 200 &&
          star.y > -200 &&
          star.y < canvas.height + 200
        );
      });
    },
    [createShootingStar],
  );

  const renderShootingStars = useCallback(
    (ctx: CanvasRenderingContext2D, currentTime: number) => {
      shootingStarsRef.current.forEach((star) => {
        const opacity = Math.min(1, (star.life / star.maxLife) * 1.2); // Mais luminosas
        const timeDelta = (currentTime - star.startTime) * 0.001;

        // Animação de tamanho baseada em seno
        const sizeVariation = 1 + Math.sin(timeDelta * 8) * 0.3; // Pulso mais intenso
        const currentSize = star.size * sizeVariation;

        // Desenha a cauda da estrela cadente
        const tailPoints = [];
        for (let i = 0; i < star.tailLength; i++) {
          const progress = i / star.tailLength;
          const tailOpacity = opacity * (1 - progress) * 0.7;

          tailPoints.push({
            x: star.x - star.vx * progress * 3,
            y: star.y - star.vy * progress * 3,
            opacity: tailOpacity,
            size: currentSize * (1 - progress * 0.8),
          });
        }

        // Renderiza a cauda
        tailPoints.forEach((point, index) => {
          if (point.opacity > 0.01) {
            const gradient = ctx.createRadialGradient(
              point.x,
              point.y,
              0,
              point.x,
              point.y,
              point.size * 3,
            );
            gradient.addColorStop(
              0,
              star.color +
                Math.floor(point.opacity * 255)
                  .toString(16)
                  .padStart(2, "0"),
            );
            gradient.addColorStop(
              0.6,
              star.color +
                Math.floor(point.opacity * 128)
                  .toString(16)
                  .padStart(2, "0"),
            );
            gradient.addColorStop(1, star.color + "00");

            ctx.globalAlpha = point.opacity;
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.size * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Desenha o núcleo brilhante da estrela
        const coreGradient = ctx.createRadialGradient(
          star.x,
          star.y,
          0,
          star.x,
          star.y,
          currentSize * 5,
        );
        coreGradient.addColorStop(0, "#FFFFFF");
        coreGradient.addColorStop(0.2, star.color);
        coreGradient.addColorStop(0.5, star.color + "BB");
        coreGradient.addColorStop(1, star.color + "00");

        ctx.globalAlpha = Math.min(1, opacity * 1.3);
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(star.x, star.y, currentSize * 5, 0, Math.PI * 2);
        ctx.fill();

        // Núcleo interno mais brilhante
        ctx.globalAlpha = Math.min(1, opacity * 1.5);
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(star.x, star.y, currentSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
    },
    [],
  );

  // Geração dinâmica de estrelas baseada na posição da câmera
  const renderStarsCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const currentMapX = mapX.get();
    const currentMapY = mapY.get();

    // Tempo atual para animações
    const currentTime = Date.now() * 0.001; // Converte para segundos

    const colors = [
      "#60A5FA",
      "#F87171",
      "#34D399",
      "#FBBF24",
      "#A78BFA",
      "#FB7185",
    ];

    // Função hash robusta
    const hash = (x: number, y: number, layer: number) => {
      let h = 1779033703 ^ layer;
      h = Math.imul(h ^ Math.floor(x), 3432918353);
      h = (h << 13) | (h >>> 19);
      h = Math.imul(h ^ Math.floor(y), 461845907);
      h = (h << 13) | (h >>> 19);
      return (h >>> 0) / 4294967296;
    };

    // Gera estrelas dinamicamente baseado na região visível
    const generateLayer = (density: number, speed: number, layer: number) => {
      // Calcula posição da câmera com parallax
      const cameraX = -currentMapX * speed;
      const cameraY = -currentMapY * speed;

      // Área visível expandida
      const margin = 200;
      const startX = Math.floor((cameraX - margin) / 50) * 50;
      const endX = Math.ceil((cameraX + canvasWidth + margin) / 50) * 50;
      const startY = Math.floor((cameraY - margin) / 50) * 50;
      const endY = Math.ceil((cameraY + canvasHeight + margin) / 50) * 50;

      // Gera estrelas em grades não-uniformes
      for (let gx = startX; gx < endX; gx += 50) {
        for (let gy = startY; gy < endY; gy += 50) {
          const cellHash = hash(gx, gy, layer);

          // Número de estrelas nesta célula (0-density)
          const numStars = Math.floor(cellHash * density);

          for (let i = 0; i < numStars; i++) {
            const starHash = hash(gx + i * 137, gy + i * 241, layer + i);
            const starHash2 = hash(
              gx + i * 173,
              gy + i * 197,
              layer + i + 1000,
            );

            // Posição dentro da célula (completamente aleatória)
            const localX = starHash * 50;
            const localY = starHash2 * 50;

            const worldX = gx + localX;
            const worldY = gy + localY;

            // Converte para coordenadas do canvas
            const screenX = worldX - cameraX;
            const screenY = worldY - cameraY;

            // Só renderiza se visível
            if (
              screenX >= -10 &&
              screenX <= canvasWidth + 10 &&
              screenY >= -10 &&
              screenY <= canvasHeight + 10
            ) {
              // Propriedades da estrela
              const sizeHash = hash(worldX * 1.1, worldY * 1.3, layer);
              const opacityHash = hash(worldX * 1.7, worldY * 1.9, layer);
              const colorHash = hash(worldX * 2.1, worldY * 2.3, layer);

              // Hash para animações únicas de cada estrela
              const animationSeed = hash(worldX * 3.7, worldY * 4.1, layer);
              const animationSeed2 = hash(worldX * 5.3, worldY * 6.7, layer);

              const baseSize =
                layer === 1
                  ? 0.3 + sizeHash * 0.5
                  : layer === 2
                    ? 0.6 + sizeHash * 0.6
                    : 1.0 + sizeHash * 1.0;

              const baseOpacity =
                layer === 1
                  ? 0.1 + opacityHash * 0.3
                  : layer === 2
                    ? 0.2 + opacityHash * 0.4
                    : 0.4 + opacityHash * 0.5;

              // Animação de piscar - diferentes frequências para cada estrela
              const blinkSpeed = 0.5 + animationSeed * 1.5; // Velocidade entre 0.5 e 2.0
              const blinkPhase = animationSeed * Math.PI * 2; // Fase inicial aleatória
              const blinkIntensity = 0.3 + animationSeed2 * 0.4; // Intensidade entre 0.3 e 0.7
              const blinkFactor =
                1 +
                Math.sin(currentTime * blinkSpeed + blinkPhase) *
                  blinkIntensity;

              // Animação de movimento flutuante
              const floatSpeedX = (animationSeed - 0.5) * 0.8; // Velocidade entre -0.4 e 0.4
              const floatSpeedY = (animationSeed2 - 0.5) * 0.6; // Velocidade entre -0.3 e 0.3
              const floatPhaseX = animationSeed * Math.PI * 4;
              const floatPhaseY = animationSeed2 * Math.PI * 4;
              const floatRange = layer === 1 ? 0.3 : layer === 2 ? 0.5 : 0.8; // Movimento maior para estrelas maiores

              const floatOffsetX =
                Math.sin(currentTime * floatSpeedX + floatPhaseX) * floatRange;
              const floatOffsetY =
                Math.cos(currentTime * floatSpeedY + floatPhaseY) * floatRange;

              const animatedSize = baseSize * blinkFactor;
              const animatedOpacity = Math.min(1, baseOpacity * blinkFactor);
              const animatedX = screenX + floatOffsetX;
              const animatedY = screenY + floatOffsetY;

              const isColorful = layer === 3 && colorHash > 0.8;
              const color = isColorful
                ? colors[Math.floor(colorHash * colors.length)]
                : "#ffffff";

              ctx.globalAlpha = animatedOpacity;
              ctx.fillStyle = color;

              if (isColorful) {
                const gradient = ctx.createRadialGradient(
                  animatedX,
                  animatedY,
                  0,
                  animatedX,
                  animatedY,
                  animatedSize * 2.5,
                );
                gradient.addColorStop(0, color);
                gradient.addColorStop(0.4, color + "77");
                gradient.addColorStop(1, color + "00");
                ctx.fillStyle = gradient;

                ctx.beginPath();
                ctx.arc(
                  animatedX,
                  animatedY,
                  animatedSize * 2.5,
                  0,
                  Math.PI * 2,
                );
                ctx.fill();

                ctx.fillStyle = color;
              }

              ctx.beginPath();
              ctx.arc(animatedX, animatedY, animatedSize, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    };

    // Renderiza camadas
    generateLayer(8, 0.08, 1); // Background
    generateLayer(4, 0.25, 2); // Middle
    generateLayer(2, 0.5, 3); // Foreground

    // Atualiza e renderiza estrelas cadentes
    updateShootingStars(Date.now());
    renderShootingStars(ctx, Date.now());

    ctx.globalAlpha = 1;
  }, [mapX, mapY, updateShootingStars, renderShootingStars]);

  // Sistema de animação otimizado para Canvas
  useEffect(() => {
    const animate = () => {
      renderStarsCanvas();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Limpa estrelas cadentes ao desmontar
      shootingStarsRef.current = [];
    };
  }, [renderStarsCanvas]);

  // Atualiza canvas size quando container muda
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Sistema de momentum/inércia
  useEffect(() => {
    velocityRef.current = velocity;
  }, [velocity]);

  // Sistema de rotação suave
  useEffect(() => {
    let animationId: number;

    const smoothRotation = () => {
      const currentAngle = shipRotation.get();
      const target = targetRotation.current;

      // Normaliza ângulos
      let normalizedCurrent = ((currentAngle % 360) + 360) % 360;
      let normalizedTarget = ((target % 360) + 360) % 360;

      // Calcula diferença angular pelo caminho mais curto
      let diff = normalizedTarget - normalizedCurrent;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      // Interpolação suave fixa
      const newAngle = currentAngle + diff * 0.15;

      shipRotation.set(newAngle);

      animationId = requestAnimationFrame(smoothRotation);
    };

    animationId = requestAnimationFrame(smoothRotation);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [shipRotation]);

  // Função para repelir o jogador
  const repelPlayer = useCallback(
    (collisionX: number, collisionY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Calcula direção da repulsão (do centro da barreira para fora)
      const repelDirectionX = collisionX - centerX;
      const repelDirectionY = collisionY - centerY;
      const distance = Math.sqrt(
        repelDirectionX * repelDirectionX + repelDirectionY * repelDirectionY,
      );

      if (distance > 0) {
        // Normaliza a direção e aplica força de repulsão
        const normalizedX = repelDirectionX / distance;
        const normalizedY = repelDirectionY / distance;
        const repelForce = 15; // Força da repulsão

        // Para o movimento atual imediatamente
        setVelocity({ x: 0, y: 0 });
        setIsDecelerating(false);

        // Aplica repulsão ao mapa (movimento inverso)
        const currentMapX = mapX.get();
        const currentMapY = mapY.get();

        animate(mapX, currentMapX - normalizedX * repelForce, {
          duration: 0.3,
          ease: "easeOut",
        });
        animate(mapY, currentMapY - normalizedY * repelForce, {
          duration: 0.3,
          ease: "easeOut",
        });

        // Atualiza posição da nave correspondentemente
        const repelShipX = (normalizedX * repelForce) / 12;
        const repelShipY = (normalizedY * repelForce) / 12;

        setShipPosition((prev) => ({
          x: wrap(prev.x + repelShipX, 0, WORLD_CONFIG.width),
          y: wrap(prev.y + repelShipY, 0, WORLD_CONFIG.height),
        }));
      }
    },
    [mapX, mapY],
  );

  // Função para mostrar notificação de colisão local
  const showCollisionNotification = useCallback(() => {
    const notificationId = Date.now();
    setCollisionNotification({ show: true, id: notificationId });

    // Remove a notificação após 4 segundos
    setTimeout(() => {
      setCollisionNotification((prev) =>
        prev.id === notificationId ? { show: false, id: 0 } : prev,
      );
    }, 4000);
  }, []);

  // Função para verificar colisão apenas na borda visual da barreira circular
  const checkBarrierCollision = useCallback(
    (proposedMapX: number, proposedMapY: number) => {
      // Raio exato da barreira visual: 2400px diâmetro = 1200px raio
      const barrierRadius = 1200;

      // Calcula a distância do centro (0,0) no sistema de coordenadas do mapa visual
      const distanceFromCenter = Math.sqrt(
        proposedMapX * proposedMapX + proposedMapY * proposedMapY,
      );

      // Só detecta colisão bem próximo da borda visual (1190-1220px)
      // Permite navegar até quase tocar a linha tracejada
      if (distanceFromCenter > 1190 && distanceFromCenter <= 1220) {
        const canvas = canvasRef.current;
        if (!canvas) return { isColliding: true, collisionPoint: null };

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Calcula o ponto exato de colisão na borda da barreira
        const angle = Math.atan2(proposedMapY, proposedMapX);

        // Ponto de colisão na borda da barreira (em coordenadas de tela)
        const collisionX = centerX + Math.cos(angle) * barrierRadius;
        const collisionY = centerY + Math.sin(angle) * barrierRadius;

        return {
          isColliding: true,
          collisionPoint: { x: collisionX, y: collisionY },
        };
      }

      // Dentro da barreira ou muito longe = sem colisão
      return { isColliding: false, collisionPoint: null };
    },
    [],
  );

  // Função para atualizar direção do auto-piloto baseada na posição do mouse
  const updateAutoPilotDirection = useCallback(
    (mouseX: number, mouseY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Converte coordenadas do mouse para posição relativa ao canvas
      const relativeMouseX = mouseX - rect.left;
      const relativeMouseY = mouseY - rect.top;

      const dirX = relativeMouseX - centerX;
      const dirY = relativeMouseY - centerY;
      const length = Math.sqrt(dirX * dirX + dirY * dirY);

      if (length > 0) {
        setAutoPilotDirection({
          x: dirX / length,
          y: dirY / length,
        });
      }
    },
    [],
  );

  // Sistema de auto-piloto que segue o mouse constantemente
  useEffect(() => {
    if (!isAutoPilot) return;

    let animationId: number;

    const autoPilotMovement = () => {
      const speed = 1.8; // Velocidade reduzida para melhor controle
      const deltaX = autoPilotDirection.x * speed;
      const deltaY = autoPilotDirection.y * speed;

      // Calcula nova posição proposta
      const proposedX = wrap(
        shipPosRef.current.x - deltaX / 12,
        0,
        WORLD_CONFIG.width,
      );
      const proposedY = wrap(
        shipPosRef.current.y - deltaY / 12,
        0,
        WORLD_CONFIG.height,
      );

      // Verifica colisão com barreira usando coordenadas do mapa visual
      const currentMapX = mapX.get();
      const currentMapY = mapY.get();
      const deltaMapX = (shipPosRef.current.x - proposedX) * 12;
      const deltaMapY = (shipPosRef.current.y - proposedY) * 12;
      const proposedMapX = currentMapX + deltaMapX;
      const proposedMapY = currentMapY + deltaMapY;

      const collision = checkBarrierCollision(proposedMapX, proposedMapY);
      if (collision.isColliding) {
        // Para o auto-piloto em caso de colisão
        setIsAutoPilot(false);
        setIsColliding(true);
        setTimeout(() => setIsColliding(false), 200);
        if (collision.collisionPoint) {
          repelPlayer(collision.collisionPoint.x, collision.collisionPoint.y);
        }
        playBarrierCollisionSound();
        showCollisionNotification();
        return;
      }

      // Atualiza posição
      setShipPosition({ x: proposedX, y: proposedY });

      // Atualiza mapa visual
      const newMapX = mapX.get() + deltaX;
      const newMapY = mapY.get() + deltaY;

      mapX.set(newMapX);
      mapY.set(newMapY);

      // Atualiza rotação da nave para seguir a direção
      const angle =
        Math.atan2(-autoPilotDirection.y, -autoPilotDirection.x) *
          (180 / Math.PI) +
        90;
      targetRotation.current = angle;

      animationId = requestAnimationFrame(autoPilotMovement);
    };

    animationId = requestAnimationFrame(autoPilotMovement);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [
    isAutoPilot,
    autoPilotDirection,
    mapX,
    mapY,
    checkBarrierCollision,
    repelPlayer,
    showCollisionNotification,
  ]);

  // Sistema de rastreamento do mouse durante auto-piloto
  useEffect(() => {
    if (!isAutoPilot) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCurrentMousePos({ x: e.clientX, y: e.clientY });
      updateAutoPilotDirection(e.clientX, e.clientY);
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isAutoPilot, updateAutoPilotDirection]);

  // Sistema de momentum mais suave usando interpolação
  useEffect(() => {
    if (
      !isDragging &&
      !isAutoPilot &&
      (Math.abs(velocity.x) > 0.001 || Math.abs(velocity.y) > 0.001)
    ) {
      setIsDecelerating(true);

      let animationId: number;

      const applyMomentum = () => {
        const currentVel = velocityRef.current;
        const friction = 0.995; // Atrito muito suave para deslizamento longo

        // Para quando velocidade fica muito baixa
        if (Math.abs(currentVel.x) < 0.001 && Math.abs(currentVel.y) < 0.001) {
          setIsDecelerating(false);
          setVelocity({ x: 0, y: 0 });
          return;
        }

        const newVelX = currentVel.x * friction;
        const newVelY = currentVel.y * friction;

        // Movimento ainda mais suave para evitar saltos
        const deltaX = newVelX * 1.5; // Movimento mapa reduzido
        const deltaY = newVelY * 1.5;

        // Calcula nova posição proposta para momentum
        const proposedX = wrap(
          shipPosRef.current.x - deltaX / 20, // Divisão maior para movimento mais suave
          0,
          WORLD_CONFIG.width,
        );
        const proposedY = wrap(
          shipPosRef.current.y - deltaY / 20,
          0,
          WORLD_CONFIG.height,
        );

        // Verifica colisão com barreira usando coordenadas do mapa visual
        let newX = proposedX;
        let newY = proposedY;

        const currentMapX = mapX.get();
        const currentMapY = mapY.get();
        const deltaMapX = (shipPosRef.current.x - proposedX) * 12;
        const deltaMapY = (shipPosRef.current.y - proposedY) * 12;
        const proposedMapX = currentMapX + deltaMapX;
        const proposedMapY = currentMapY + deltaMapY;

        const collision = checkBarrierCollision(proposedMapX, proposedMapY);
        if (collision.isColliding) {
          // Ativa flash vermelho
          setIsColliding(true);
          setTimeout(() => setIsColliding(false), 200); // Flash de 0.2 segundos
          if (collision.collisionPoint) {
            repelPlayer(collision.collisionPoint.x, collision.collisionPoint.y);
          }
          // Reproduz som de colisão
          playBarrierCollisionSound();
          // Mostra notificação
          showCollisionNotification();
          setIsDecelerating(false);
          setVelocity({ x: 0, y: 0 });
          return;
        }

        setShipPosition({ x: newX, y: newY });

        // Mapa visual move de forma muito suave
        const newMapX = mapX.get() + deltaX;
        const newMapY = mapY.get() + deltaY;

        mapX.set(newMapX);
        mapY.set(newMapY);

        setVelocity({ x: newVelX, y: newVelY });

        animationId = requestAnimationFrame(applyMomentum);
      };

      animationId = requestAnimationFrame(applyMomentum);

      return () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
    }
  }, [
    isDragging,
    isAutoPilot,
    mapX,
    mapY,
    checkBarrierCollision,
    repelPlayer,
    showCollisionNotification,
  ]);

  // Função para calcular distância toroidal correta
  const getToroidalDistance = (
    pos1: { x: number; y: number },
    pos2: { x: number; y: number },
  ) => {
    // Calcula diferenças considerando wrap em mundo toroidal
    const dx1 = Math.abs(pos1.x - pos2.x);
    const dx2 = WORLD_CONFIG.width - dx1;
    const minDx = Math.min(dx1, dx2);

    const dy1 = Math.abs(pos1.y - pos2.y);
    const dy2 = WORLD_CONFIG.height - dy1;
    const minDy = Math.min(dy1, dy2);

    return Math.sqrt(minDx * minDx + minDy * minDy);
  };

  // Verifica proximidade com cálculo de distância toroidal correto
  useEffect(() => {
    const interval = setInterval(() => {
      const threshold = 8;
      let closest: string | null = null;
      let closestDistance = Infinity;

      GALAXY_POINTS.forEach((point) => {
        const distance = getToroidalDistance(shipPosRef.current, point);

        if (distance < threshold && distance < closestDistance) {
          closest = point.id;
          closestDistance = distance;
        }
      });

      setNearbyPoint(closest);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Salva posição - simples
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDragging && !isAutoPilot) {
        localStorage.setItem(
          "xenopets-player-data",
          JSON.stringify({
            ship: shipPosRef.current,
            map: { x: mapX.get(), y: mapY.get() },
          }),
        );
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isDragging, isAutoPilot]);

  // Sistema de mouse nativo mais confiável
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Sistema de progresso do hold melhorado
  useEffect(() => {
    if (!isHolding || !holdStartTime) return;

    let animationId: number;

    const updateProgress = () => {
      const elapsed = Date.now() - holdStartTime;
      const progress = Math.min(elapsed / 2500, 1); // 2.5 segundos
      setHoldProgress(progress);

      if (progress >= 1) {
        // Ativa auto-piloto
        setIsAutoPilot(true);
        setIsHolding(false);
        setHoldProgress(0);
        setHoldStartTime(null);
      } else if (isHolding) {
        animationId = requestAnimationFrame(updateProgress);
      }
    };

    animationId = requestAnimationFrame(updateProgress);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isHolding, holdStartTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAutoPilot) {
      // Se estiver em auto-piloto, para o auto-piloto
      setIsAutoPilot(false);
      return;
    }

    setIsDragging(true);
    setHasMoved(false);
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Inicia o timer para auto-piloto
    const startTime = Date.now();
    setHoldStartTime(startTime);
    setIsHolding(true);
    setHoldProgress(0);

    // Calcula direção inicial para auto-piloto
    updateAutoPilotDirection(e.clientX, e.clientY);

    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    // Para o timer de auto-piloto se o mouse se mover
    if (isHolding) {
      setIsHolding(false);
      setHoldProgress(0);
      setHoldStartTime(null);
    }

    const currentTime = Date.now();
    const deltaTime = currentTime - lastMoveTime.current;
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;

    // Momentum suavizado baseado no movimento
    if (deltaTime > 0) {
      const velX = Math.max(-1.5, Math.min(1.5, deltaX * 0.08));
      const velY = Math.max(-1.5, Math.min(1.5, deltaY * 0.08));
      setVelocity({ x: velX, y: velY });
    }

    // Calcula nova posição proposta
    const proposedX = wrap(
      shipPosRef.current.x - deltaX / 12,
      0,
      WORLD_CONFIG.width,
    );
    const proposedY = wrap(
      shipPosRef.current.y - deltaY / 12,
      0,
      WORLD_CONFIG.height,
    );

    // Verifica colisão com barreira usando coordenadas do mapa visual
    let newX = proposedX;
    let newY = proposedY;
    let allowMovement = true;

    const currentMapX = mapX.get();
    const currentMapY = mapY.get();
    const deltaMapX = (shipPosRef.current.x - proposedX) * 12;
    const deltaMapY = (shipPosRef.current.y - proposedY) * 12;
    const proposedMapX = currentMapX + deltaMapX;
    const proposedMapY = currentMapY + deltaMapY;

    const collision = checkBarrierCollision(proposedMapX, proposedMapY);
    if (collision.isColliding) {
      // Ativa flash vermelho
      setIsColliding(true);
      setTimeout(() => setIsColliding(false), 200); // Flash de 0.2 segundos
      if (collision.collisionPoint) {
        repelPlayer(collision.collisionPoint.x, collision.collisionPoint.y);
      }
      // Reproduz som de colisão
      playBarrierCollisionSound();
      // Mostra notificação
      showCollisionNotification();
      newX = shipPosRef.current.x;
      newY = shipPosRef.current.y;
      allowMovement = false;
      setVelocity({ x: 0, y: 0 });
      setIsDecelerating(false);
    }

    setShipPosition({ x: newX, y: newY });

    // Só atualiza mapa visual se movimento é permitido
    if (allowMovement) {
      // Atualiza mapa visual com wrap
      let newMapX = mapX.get() + deltaX;
      let newMapY = mapY.get() + deltaY;

      // Wrap visual do mapa expandido
      const wrapThreshold = 5000;
      if (newMapX > wrapThreshold) newMapX -= wrapThreshold * 2;
      if (newMapX < -wrapThreshold) newMapX += wrapThreshold * 2;
      if (newMapY > wrapThreshold) newMapY -= wrapThreshold * 2;
      if (newMapY < -wrapThreshold) newMapY += wrapThreshold * 2;

      mapX.set(newMapX);
      mapY.set(newMapY);
    }

    // Rotação responsiva com interpolação suave
    if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 1) {
      setHasMoved(true);
      const newAngle = Math.atan2(-deltaY, -deltaX) * (180 / Math.PI) + 90;
      targetRotation.current = newAngle;
      lastRotationUpdate.current = Date.now();
    }

    lastMousePos.current = { x: e.clientX, y: e.clientY };
    lastMoveTime.current = currentTime;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsHolding(false);
    setHoldProgress(0);
    setHoldStartTime(null);

    // Se não moveu (apenas clique), para completamente
    if (!hasMoved) {
      setVelocity({ x: 0, y: 0 });
      setIsDecelerating(false);
    }

    localStorage.setItem(
      "xenopets-player-data",
      JSON.stringify({
        ship: shipPosRef.current,
        map: { x: mapX.get(), y: mapY.get() },
      }),
    );
  };

  // Mouse events globais para capturar movimento fora do elemento
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Para o timer de auto-piloto se o mouse se mover
      if (isHolding) {
        setIsHolding(false);
        setHoldProgress(0);
        setHoldStartTime(null);
      }

      const currentTime = Date.now();
      const deltaTime = currentTime - lastMoveTime.current;
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;

      // Momentum suavizado baseado no movimento
      if (deltaTime > 0) {
        const velX = Math.max(-1.5, Math.min(1.5, deltaX * 0.08));
        const velY = Math.max(-1.5, Math.min(1.5, deltaY * 0.08));
        setVelocity({ x: velX, y: velY });
      }

      // Calcula nova posição proposta
      const proposedX = wrap(
        shipPosRef.current.x - deltaX / 12,
        0,
        WORLD_CONFIG.width,
      );
      const proposedY = wrap(
        shipPosRef.current.y - deltaY / 12,
        0,
        WORLD_CONFIG.height,
      );

      // Verifica colisão com barreira usando coordenadas do mapa visual
      let newX = proposedX;
      let newY = proposedY;
      let allowMovement = true;

      const currentMapX = mapX.get();
      const currentMapY = mapY.get();
      const deltaMapX = (shipPosRef.current.x - proposedX) * 12;
      const deltaMapY = (shipPosRef.current.y - proposedY) * 12;
      const proposedMapX = currentMapX + deltaMapX;
      const proposedMapY = currentMapY + deltaMapY;

      const collision = checkBarrierCollision(proposedMapX, proposedMapY);
      if (collision.isColliding) {
        // Ativa flash vermelho
        setIsColliding(true);
        setTimeout(() => setIsColliding(false), 200); // Flash de 0.2 segundos
        if (collision.collisionPoint) {
          repelPlayer(collision.collisionPoint.x, collision.collisionPoint.y);
        }
        // Reproduz som de colisão
        playBarrierCollisionSound();
        // Mostra notificação
        showCollisionNotification();
        newX = shipPosRef.current.x;
        newY = shipPosRef.current.y;
        allowMovement = false;
        setVelocity({ x: 0, y: 0 });
        setIsDecelerating(false);
      }

      setShipPosition({ x: newX, y: newY });

      // Só atualiza mapa visual se movimento é permitido
      if (allowMovement) {
        // Atualiza mapa visual com wrap
        let newMapX = mapX.get() + deltaX;
        let newMapY = mapY.get() + deltaY;

        // Wrap visual do mapa quando sair muito longe
        const wrapThreshold = 5000; // pixels antes de fazer wrap
        if (newMapX > wrapThreshold) newMapX -= wrapThreshold * 2;
        if (newMapX < -wrapThreshold) newMapX += wrapThreshold * 2;
        if (newMapY > wrapThreshold) newMapY -= wrapThreshold * 2;
        if (newMapY < -wrapThreshold) newMapY += wrapThreshold * 2;

        mapX.set(newMapX);
        mapY.set(newMapY);
      }

      if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 1) {
        setHasMoved(true);
        const newAngle = Math.atan2(-deltaY, -deltaX) * (180 / Math.PI) + 90;
        targetRotation.current = newAngle;
        lastRotationUpdate.current = Date.now();
      }

      lastMousePos.current = { x: e.clientX, y: e.clientY };
      lastMoveTime.current = currentTime;
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsHolding(false);
      setHoldProgress(0);
      setHoldStartTime(null);

      // Se não moveu (apenas clique), para completamente
      if (!hasMoved) {
        setVelocity({ x: 0, y: 0 });
        setIsDecelerating(false);
      }

      localStorage.setItem(
        "xenopets-player-data",
        JSON.stringify({
          ship: shipPosRef.current,
          map: { x: mapX.get(), y: mapY.get() },
        }),
      );
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    isDragging,
    isHolding,
    mapX,
    mapY,
    shipRotation,
    checkBarrierCollision,
    repelPlayer,
    showCollisionNotification,
  ]);

  const resetShipPosition = () => {
    setShipPosition({ x: 50, y: 50 });
    setVelocity({ x: 0, y: 0 });
    setIsDecelerating(false);
    setIsAutoPilot(false);
    animate(mapX, 0, { duration: 0.5 });
    animate(mapY, 0, { duration: 0.5 });
    animate(shipRotation, 0, { duration: 0.5 });
    localStorage.removeItem("xenopets-player-data");
  };

  const handlePointClick = (pointId: string) => {
    const point = GALAXY_POINTS.find((p) => p.id === pointId);
    if (point) {
      onPointClick(pointId, point);
    }
  };

  // Renderiza pontos de forma otimizada
  const renderPoints = () => {
    return GALAXY_POINTS.map((point) => (
      <div key={point.id} className="pointer-events-auto relative z-30">
        <MapPoint
          point={point}
          isNearby={nearbyPoint === point.id}
          onClick={() => handlePointClick(point.id)}
          isDragging={isDragging}
          style={{
            left: `${point.x}%`,
            top: `${point.y}%`,
            willChange: "transform", // otimização GPU
          }}
        />
      </div>
    ));
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[650px] bg-gradient-to-br from-gray-950 via-slate-900 to-black rounded-2xl overflow-hidden ${
        isDragging
          ? "cursor-grabbing"
          : isAutoPilot
            ? "cursor-pointer"
            : "cursor-grab"
      }`}
      style={{ userSelect: "none" }}
    >
      {/* Simple progress bar for auto-pilot activation */}
      {isHolding && holdProgress > 0 && (
        <motion.div
          className="absolute z-50 w-full flex justify-center"
          style={{ top: "calc(50% - 50px)" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <div className="w-12 h-2 bg-gray-800/60 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${holdProgress * 100}%` }}
              transition={{ duration: 0.1, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      )}

      {/* Notificação de Colisão - Centralizada no topo do mapa */}
      {collisionNotification.show && (
        <div className="absolute top-4 left-0 right-0 z-50 flex justify-center">
          <motion.div
            className="bg-black/10 text-white/60 px-4 py-2 rounded-lg"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs font-mono text-white/60 leading-tight text-center">
              ALTO: nave não credenciada
              <br />
              para cruzar barreira
            </p>
          </motion.div>
        </div>
      )}
      {/* Canvas para estrelas com parallax otimizado */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: "100%",
          height: "100%",
          willChange: "contents",
        }}
      />

      {/* Nebulosas de fundo */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{
            background: "radial-gradient(circle, #374151, #1f2937)",
            left: "20%",
            top: "30%",
          }}
        />
        <div
          className="absolute w-48 h-48 rounded-full opacity-8 blur-2xl"
          style={{
            background: "radial-gradient(circle, #1f2937, #111827)",
            right: "25%",
            bottom: "20%",
          }}
        />
      </div>

      {/* Área de drag fixa - sempre cobre toda a tela */}
      <div
        className={`absolute inset-0 z-5 ${isDragging ? "cursor-grabbing" : isAutoPilot ? "cursor-pointer" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ backgroundColor: "transparent", userSelect: "none" }}
      />

      {/* Mapa visual - movido pelo drag acima */}
      <motion.div
        ref={mapRef}
        className="absolute inset-0 w-[300%] h-[300%] -left-full -top-full pointer-events-none"
        style={{
          x: mapX,
          y: mapY,
          willChange: "transform", // otimização para GPU
        }}
      >
        {/* Barreira circular fixa no centro do mapa */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "50%", // Centro do mundo (100% = WORLD_CONFIG.width)
            top: "50%", // Centro do mundo (100% = WORLD_CONFIG.height)
            width: "2400px", // Diâmetro 2400px = 1200px de raio
            height: "2400px",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            zIndex: 5,
          }}
        >
          {/* Animação de rotação continua */}
          <motion.div
            className="w-full h-full rounded-full border-2 border-dashed"
            style={{
              borderColor: isColliding
                ? "rgba(239, 68, 68, 0.9)"
                : "rgba(255, 255, 255, 0.15)",
            }}
            animate={{
              rotate: 360,
            }}
            transition={{
              rotate: {
                duration: 600, // Rotação muito mais lenta - 10 minutos por volta
                repeat: Infinity,
                ease: "linear",
              },
            }}
          />
        </div>
        {/* Pontos removidos */}
      </motion.div>

      {/* Nave do jogador - fixa no centro */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <PlayerShip
          rotation={shipRotation}
          isNearPoint={nearbyPoint !== null}
          isDragging={isDragging || isAutoPilot}
          isDecelerating={isDecelerating}
        />
      </div>

      {/* Coordenadas simplificadas na parte inferior */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/20 text-xs font-mono font-thin whitespace-nowrap">
        X: {mapX.get().toFixed(1)} Y: {mapY.get().toFixed(1)}
        {isAutoPilot && <span className="ml-4 text-blue-300">[AUTO]</span>}
      </div>
    </div>
  );
};
