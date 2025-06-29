import React from "react";
import { motion } from "framer-motion";
import { Globe, Building2, Sparkles, Mountain } from "lucide-react";

interface MapPointData {
  id: string;
  x: number;
  y: number;
  name: string;
  type: "planet" | "station" | "nebula" | "asteroid";
  description: string;
  image?: string;
}

interface MapPointProps {
  point: MapPointData;
  isNearby: boolean;
  onClick: () => void;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

const getPointIcon = (type: string) => {
  switch (type) {
    case "planet":
      return Globe;
    case "station":
      return Building2;
    case "nebula":
      return Sparkles;
    case "asteroid":
      return Mountain;
    default:
      return Globe;
  }
};

const getPointColor = (type: string, pointId?: string) => {
  // Cores específicas para cada ponto
  const pointColors = {
    "mundo-gelado": {
      primary: "#22c55e",
      secondary: "#16a34a",
      glow: "rgb(34, 197, 94)",
    },
    "campo-asteroides": {
      primary: "#f59e0b",
      secondary: "#d97706",
      glow: "rgb(245, 158, 11)",
    },
    "planeta-limite": {
      primary: "#ec4899",
      secondary: "#be185d",
      glow: "rgb(236, 72, 153)",
    },
    "estacao-borda": {
      primary: "#3b82f6",
      secondary: "#1d4ed8",
      glow: "rgb(59, 130, 246)",
    },
    "nebulosa-crimson": {
      primary: "#8b5cf6",
      secondary: "#7c3aed",
      glow: "rgb(139, 92, 246)",
    },
    "estacao-omega": {
      primary: "#06b6d4",
      secondary: "#0891b2",
      glow: "rgb(6, 182, 212)",
    },
  };

  if (pointId && pointColors[pointId as keyof typeof pointColors]) {
    return pointColors[pointId as keyof typeof pointColors];
  }

  // Cores padrão por tipo
  switch (type) {
    case "planet":
      return {
        primary: "#22c55e",
        secondary: "#16a34a",
        glow: "rgb(34, 197, 94)",
      };
    case "station":
      return {
        primary: "#3b82f6",
        secondary: "#1d4ed8",
        glow: "rgb(59, 130, 246)",
      };
    case "nebula":
      return {
        primary: "#8b5cf6",
        secondary: "#7c3aed",
        glow: "rgb(139, 92, 246)",
      };
    case "asteroid":
      return {
        primary: "#f59e0b",
        secondary: "#d97706",
        glow: "rgb(245, 158, 11)",
      };
    default:
      return {
        primary: "#6b7280",
        secondary: "#4b5563",
        glow: "rgb(107, 114, 128)",
      };
  }
};

export const MapPoint: React.FC<MapPointProps> = ({
  point,
  isNearby,
  onClick,
  isDragging = false,
  style,
}) => {
  const Icon = getPointIcon(point.type);
  const colors = getPointColor(point.type, point.id);

  // Verificar se este ponto tem uma imagem customizada
  const hasCustomImage = [
    "mundo-gelado",
    "campo-asteroides", 
    "planeta-limite",
    "estacao-borda",
    "nebulosa-crimson",
    "estacao-omega"
  ].includes(point.id);

  const getImageSrc = (pointId: string) => {
    const imageMap = {
      "mundo-gelado": "/image copy.png",
      "campo-asteroides": "https://cdn.builder.io/api/v1/image/assets%2Fed889bbb99a84576b94d83d659582f83%2F38e9254c0edd4dc79ac95881d9b4a980?format=webp&width=800",
      "planeta-limite": "https://cdn.builder.io/api/v1/image/assets%2Fed889bbb99a84576b94d83d659582f83%2F3186372ded534a41a688af7afc027f4f?format=webp&width=800",
      "estacao-borda": "https://cdn.builder.io/api/v1/image/assets%2Fed889bbb99a84576b94d83d659582f83%2F8a24c18cd7c2409a994370826e27a122?format=webp&width=800",
      "nebulosa-crimson": "https://cdn.builder.io/api/v1/image/assets%2Fed889bbb99a84576b94d83d659582f83%2Fb46f0e9c86944916bb1dbd8bbbe00729?format=webp&width=800",
      "estacao-omega": "https://cdn.builder.io/api/v1/image/assets%2Fed889bbb99a84576b94d83d659582f83%2F756e417912144ff2afa79d478073dbc7?format=webp&width=800"
    };
    return imageMap[pointId as keyof typeof imageMap];
  };

  return (
    <motion.div
      className={`absolute z-10 ${isDragging ? "pointer-events-none" : "cursor-pointer"}`}
      style={style}
      onClick={onClick}
      whileHover={
        !isDragging
          ? {
              scale: 1.05,
              transition: { duration: 0.2, ease: "easeOut" },
            }
          : {}
      }
      whileTap={!isDragging ? { scale: 0.95 } : {}}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        delay: Math.random() * 0.5,
      }}
    >
      {/* Outer pulse ring for nearby state */}
      {isNearby && (
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ 
            borderColor: colors.primary,
            width: "120px",
            height: "120px",
            left: "-10px",
            top: "-10px"
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.8, 0.3, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Container principal com tamanho uniforme */}
      <motion.div
        className="relative w-24 h-24 rounded-full overflow-hidden"
        style={{
          filter: `blur(0.5px) drop-shadow(0 8px 16px ${colors.glow}40) drop-shadow(0 4px 8px ${colors.glow}60)`,
          background: hasCustomImage ? 'transparent' : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          border: hasCustomImage ? 'none' : `2px solid ${colors.primary}60`,
        }}
        animate={{
          boxShadow: isNearby
            ? `0 0 30px ${colors.glow}, 0 0 60px ${colors.glow}40`
            : `0 0 15px ${colors.glow}60, 0 0 30px ${colors.glow}20`,
        }}
      >
        {/* Imagem customizada ou ícone padrão */}
        {hasCustomImage ? (
          <img
            src={getImageSrc(point.id)}
            alt={point.name}
            className="w-full h-full object-cover"
            style={{
              filter: "blur(0.3px)",
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon size={32} className="text-white drop-shadow-lg" />
          </div>
        )}

        {/* Overlay com blur nas bordas */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, transparent 60%, ${colors.primary}20 80%, ${colors.primary}40 100%)`,
            backdropFilter: "blur(0.5px)",
          }}
        />
      </motion.div>

      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 rounded-full opacity-20 blur-md -z-10"
        style={{
          background: `radial-gradient(circle, ${colors.primary}, transparent 70%)`,
          width: "140%",
          height: "140%",
          left: "-20%",
          top: "-20%",
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: Math.random() * 2,
        }}
      />

      {/* Hover tooltip */}
      <motion.div
        className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap backdrop-blur-sm border border-white/20 pointer-events-none opacity-0 z-20"
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="font-medium">{point.name}</div>
        <div className="text-gray-300 text-xs">{point.description}</div>

        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90" />
      </motion.div>

      {/* Orbit rings para planetas */}
      {point.type === "planet" && (
        <motion.div
          className="absolute inset-0 rounded-full border border-white/10 -z-10"
          style={{
            width: "160%",
            height: "160%",
            left: "-30%",
            top: "-30%",
          }}
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      )}
    </motion.div>
  );
};