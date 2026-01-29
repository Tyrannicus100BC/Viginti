import React from 'react';
import styles from './EventsModule.module.css';

interface EventsModuleProps {
    isVisible: boolean;
    title?: string;
    description?: string;
}

export const EventsModule: React.FC<EventsModuleProps> = ({ isVisible, title, description }) => {
    return (
        <div className={`${styles.container} ${isVisible ? styles.visible : ''}`}>
            {title && <div className={styles.title}>{title}</div>}
            <div className={styles.description}>
                {description || "No Event"}
            </div>
        </div>
    );
};
