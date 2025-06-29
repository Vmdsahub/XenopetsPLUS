import React, { useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { MapPoint } from "./MapPoint";
import { PlayerShip } from "./PlayerShip";
import { playBarrierCollisionSound } from "../../utils/soundManager";

interface GalaxyMapProps {
  onPointClick: (pointId: string, pointData: any) => void;
}

// Dados dos pontos do mapa
const mapPoints = [
  {
    id: "terra-nova",
    x: 20,
    y: 30,
    name: "Terra Nova",
    type: "planet" as const,
    description: "Um planeta verdejante cheio de vida",
    image: "https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg",
  },
  {
    id: "estacao-omega",
    x: 70,
    y: 25,
    name: "Estação Omega",
    type: "station" as const,
    description: "Uma estação espacial avançada",
    image: "https://images.pexels.com/photos/2159/flight-sky-earth-space.jpg",
  },
  {
    id: "nebulosa-crimson",
    x: 45,
    y: 70,
    name: "Nebulosa Crimson",
    type: "nebula" as const,
    description: "Uma nebulosa vermelha misteriosa",
    image: "https://images.pexels.com/photos/1169754/pexels-photo-1169754.jpeg",
  },
  {
    id: "mundo-gelado",
    x: 50,
    y: 50,
    name: "Mundo Gelado",
    type: "planet" as const,
    description: "Um planeta coberto de gelo eterno",
    image: "https://images.pexels.com/photos/1169754/pexels-photo-1169754.jpeg",
  },
  {
    id: "campo-asteroides",
    x: 80,
    y: 60,
    name: "Campo de Asteroides",
    type: "asteroid" as const,
    description: "Uma região perigosa cheia de asteroides",
    image: "https://images.pexels.com/photos/2156/sky-earth-space-working.jpg",
  },
];

export const GalaxyMap: React.FC<GalaxyMapProps> = ({ onPointClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [nearbyPoint, setNearbyPoint] = useState<string | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Motion values para a posição da nave
  const shipX = useMotionValue(0);
  const shipY = useMotionValue(0);

  // Calcular rotação baseada na velocidade de movimento
  const shipRotation = useTransform(
    [shipX, shipY],
    (latest) => {
      const [x, y] = latest;
      return Math.atan2(y, x) * (180 / Math.PI) + 90;
    }
  );

  // Verificar proximidade com pontos
  const checkProximity = useCallback((x: number, y: number) => {
    const threshold = 50;
    let closestPoint = null;
    let minDistance = Infinity;

    mapPoints.forEach((point) => {
      const pointX = (point.x / 100) * 300 - 150;
      const pointY = (point.y / 100) * 300 - 150;
      const distance = Math.sqrt(
        Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2)
      );

      if (distance < threshold && distance < minDistance) {
        minDistance = distance;
        closestPoint = point.id;
      }
    });

    setNearbyPoint(closestPoint);
  }, []);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDrag = (event: any, info: PanInfo) => {
    const x = shipX.get();
    const y = shipY.get();
    checkProximity(x, y);
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);

    // Verificar colisão com bordas
    const x = shipX.get();
    const y = shipY.get();
    const boundary = 140;

    if (Math.abs(x) > boundary || Math.abs(y) > boundary) {
      playBarrierCollisionSound();
    }
  };

  const handlePointClick = (point: any) => {
    onPointClick(point.id, point);
  };

  return (
    <div className="relative w-full h-80 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 rounded-2xl overflow-hidden">
      {/* Fundo estrelado */}
      <div className="absolute inset-0">
        {[...Array(100)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full opacity-60"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 2 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Container de movimento */}
      <div
        ref={constraintsRef}
        className="absolute inset-0 flex items-center justify-center"
      >
        {/* Pontos do mapa */}
        {mapPoints.map((point) => (
          <MapPoint
            key={point.id}
            point={point}
            isNearby={nearbyPoint === point.id}
            onClick={() => handlePointClick(point)}
            isDragging={isDragging}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}

        {/* Nave do jogador */}
        <motion.div
          className="absolute"
          drag
          dragConstraints={{
            left: -150,
            right: 150,
            top: -150,
            bottom: 150,
          }}
          dragElastic={0.1}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x: shipX, y: shipY }}
          whileDrag={{ scale: 1.1 }}
        >
          <PlayerShip
            rotation={shipRotation}
            isNearPoint={!!nearbyPoint}
            isDragging={isDragging}
          />
        </motion.div>
      </div>

      {/* Indicador de proximidade */}
      {nearbyPoint && (
        <motion.div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="text-center">
            <p className="font-medium">
              {mapPoints.find((p) => p.id === nearbyPoint)?.name}
            </p>
            <p className="text-xs text-gray-300">Clique para explorar</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};