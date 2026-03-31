import React, { useEffect, useState, useRef } from 'react';
import styles from './PhysicsPot.module.css';

interface PhysicsPotProps {
  totalValue: number;
  variant: 'chips' | 'multiplier';
  isCollecting: boolean;
  center: { x: number; y: number };
  onCollectionComplete: () => void;
  onItemArrived?: (value: number) => void;
  labelPrefix?: string; // '$' or 'x'
  labelId?: string;
  forceHide?: boolean;
}

export const PhysicsPot: React.FC<PhysicsPotProps> = ({
  totalValue,
  variant,
  isCollecting,
  center,
  onCollectionComplete,
  onItemArrived,
  labelPrefix = '$',
  labelId,
  forceHide = false
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

  const collectionStartedRef = useRef(false);

  useEffect(() => {
    if (isCollecting && !collectionStartedRef.current) {
      collectionStartedRef.current = true;
      
      // Just immediately complete if we're not doing the animation
      if (onItemArrived) {
        onItemArrived(totalValue);
      }
      onCollectionComplete();
    }
  }, [isCollecting, totalValue, onItemArrived, onCollectionComplete]);

  const isEssentiallyEmpty = variant === 'multiplier' 
    ? (totalValue <= 1)
    : (totalValue === 0);
  const isEmpty = forceHide || isEssentiallyEmpty;

  return (
    <div 
      className={`${styles.container} ${isEmpty ? styles.empty : ''}`}
      style={{
        transition: isCollecting ? 'opacity 0.8s ease' : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.8s ease'
      }}
    >
      <div 
        className={`${styles.potTotal} ${isPulsing ? styles.pulse : ''}`}
        id={labelId}
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
