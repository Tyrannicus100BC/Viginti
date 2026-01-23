import React, { useEffect, useState, useRef } from 'react';
import styles from './PhysicsPot.module.css';

interface PhysicsPotProps {
  totalValue: number;
  variant: 'chips' | 'multiplier';
  isCollecting: boolean;
  targetId: string;
  center: { x: number; y: number };
  onCollectionComplete: () => void;
  onItemArrived?: (value: number) => void;
  labelPrefix?: string; // '$' or 'x'
}

export const PhysicsPot: React.FC<PhysicsPotProps> = ({
  totalValue,
  variant,
  isCollecting,
  targetId,
  center,
  onCollectionComplete,
  onItemArrived,
  labelPrefix = '$'
}) => {
const [isPulsing, setIsPulsing] = useState(false);
  const prevValueRef = useRef(totalValue);

  useEffect(() => {
    if (totalValue !== prevValueRef.current) {
      if (totalValue > prevValueRef.current) {
        setIsPulsing(true);
        const timer = setTimeout(() => setIsPulsing(false), 200);
        prevValueRef.current = totalValue;
        return () => clearTimeout(timer);
      }
      prevValueRef.current = totalValue;
    }
  }, [totalValue]);

  // Collection logic - if the user still wants the number to fly to the HUD
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(1);
  const [scale, setScale] = useState(1);
  const collectionStartedRef = useRef(false);

  useEffect(() => {
    if (isCollecting && !collectionStartedRef.current) {
      collectionStartedRef.current = true;
      
      const targetEl = document.getElementById(targetId);
      if (!targetEl) {
        onCollectionComplete();
        return;
      }
      
      const targetRect = targetEl.getBoundingClientRect();
      const tx = targetRect.left + targetRect.width / 2;
      const ty = targetRect.top + targetRect.height / 2;

      const dx = tx - center.x;
      const dy = ty - center.y + 140; // Offset from the pot position

      // Simple animation to HUD
      let startTime: number | null = null;
      const duration = 600;

      const animate = (time: number) => {
        if (!startTime) startTime = time;
        const progress = Math.min((time - startTime) / duration, 1);
        
        // Easing (easeInQuad)
        const ease = progress * progress;

        setOffset({
          x: dx * ease,
          y: dy * ease
        });
        setOpacity(1 - progress);
        setScale(1 - progress * 0.8);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (onItemArrived) {
            onItemArrived(totalValue);
          }
          onCollectionComplete();
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isCollecting, targetId, center, onCollectionComplete, onItemArrived, totalValue]);

  if (totalValue === 0 && !isCollecting) return null;

  return (
    <div 
      className={styles.container}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        opacity: opacity,
        transition: isCollecting ? 'none' : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}
    >
      <div 
        className={`${styles.potTotal} ${isPulsing ? styles.pulse : ''}`}
        style={{ 
          left: center.x, 
          top: center.y - 140, 
          color: variant === 'chips' ? '#44ff44' : '#ffd700' 
        }}
      >
        <div className={styles.potValue}>
          {labelPrefix === '$' ? `$${totalValue.toLocaleString()}` : `x${totalValue.toFixed(1)}`}
        </div>
      </div>
    </div>
  );
};

