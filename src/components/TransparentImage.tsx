import React, { useEffect, useState, useRef } from 'react';

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

interface TransparentImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    threshold?: number; // 0-255, how close to white to make transparent
}

export const TransparentImage: React.FC<TransparentImageProps> = ({ src, threshold = 240, style, ...props }) => {
    const [processedSrc, setProcessedSrc] = useState<string>(TRANSPARENT_PIXEL);
    
    // Track the current src to ensure we don't accidentally set an old processed image
    const lastSrcRef = useRef(src);

    useEffect(() => {
        lastSrcRef.current = src;
        // Don't show the old processed image while loading new src
        setProcessedSrc(TRANSPARENT_PIXEL);

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        img.onload = () => {
            // If the src has changed while we were loading, don't update
            if (lastSrcRef.current !== src) return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // If the pixel is very close to white, make it transparent
                if (r > threshold && g > threshold && b > threshold) {
                    data[i + 3] = 0;
                }
            }

            ctx.putImageData(imageData, 0, 0);
            setProcessedSrc(canvas.toDataURL());
        };
    }, [src, threshold]);

    return <img src={processedSrc} style={style} {...props} />;
};
