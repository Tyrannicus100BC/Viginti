import { runExperiment } from './runner';
import type { LabConfig, WorkerReply } from './model';

// A dedicated worker also isolates the legacy tutorial singleton from the game.
self.onmessage = (event: MessageEvent<LabConfig>) => {
    const send = (reply: WorkerReply) => self.postMessage(reply);
    try {
        const experiment = runExperiment(event.data);
        let step = experiment.next();
        while (!step.done) {
            send({ type: 'progress', progress: step.value });
            step = experiment.next();
        }
        send({ type: 'complete', report: step.value });
    } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
