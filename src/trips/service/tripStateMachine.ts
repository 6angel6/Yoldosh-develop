import { TripStatus } from '../models/Trip';
import logger from '../../../shared/utils/logger';
import { BadRequestError } from '../../../shared/utils/errorHandler';
import { ErrorCode } from '../../../shared/utils/errorCodes';

export enum TripTransitionEvent {
    START_TRIP = 'START_TRIP',
    COMPLETE_TRIP = 'COMPLETE_TRIP',
    CANCEL_TRIP = 'CANCEL_TRIP',
    EMERGENCY_CANCEL = 'EMERGENCY_CANCEL',
    AUTO_COMPLETE_TRIP = 'AUTO_COMPLETE_TRIP',
}

export interface TripStateTransition {
    from: TripStatus;
    to: TripStatus;
    event: TripTransitionEvent;
}

export interface TripStateMachineContext {
    tripId: string;
    driverId: string;
    metadata?: Record<string, any>;
}

export interface StateTransitionGuard {
    (context: TripStateMachineContext): Promise<boolean> | boolean;
}

export interface StateTransitionHook {
    (context: TripStateMachineContext): Promise<void> | void;
}

const ALLOWED_TRANSITIONS: Map<
    TripStatus,
    Map<TripTransitionEvent, TripStatus>
> = new Map([
    [
        TripStatus.Created,
        new Map([
            [TripTransitionEvent.START_TRIP, TripStatus.InProgress],
            [TripTransitionEvent.CANCEL_TRIP, TripStatus.Canceled],
            [TripTransitionEvent.AUTO_COMPLETE_TRIP, TripStatus.Completed],
        ]),
    ],
    [
        TripStatus.InProgress,
        new Map([
            [TripTransitionEvent.COMPLETE_TRIP, TripStatus.Completed],
            [TripTransitionEvent.EMERGENCY_CANCEL, TripStatus.Canceled],
            [TripTransitionEvent.AUTO_COMPLETE_TRIP, TripStatus.Completed],
        ]),
    ],
    // Финальные состояния не имеют переходов
    [TripStatus.Completed, new Map()],
    [TripStatus.Canceled, new Map()],
]);

export class TripStateMachine {
    private guards: Map<string, StateTransitionGuard[]> = new Map();
    private beforeHooks: Map<string, StateTransitionHook[]> = new Map();
    private afterHooks: Map<string, StateTransitionHook[]> = new Map();

    canTransition(
        currentState: TripStatus,
        event: TripTransitionEvent,
    ): boolean {
        const transitions = ALLOWED_TRANSITIONS.get(currentState);
        if (!transitions) {
            return false;
        }
        return transitions.has(event);
    }

    getTargetState(
        currentState: TripStatus,
        event: TripTransitionEvent,
    ): TripStatus | null {
        const transitions = ALLOWED_TRANSITIONS.get(currentState);
        if (!transitions) {
            return null;
        }
        return transitions.get(event) || null;
    }

    addGuard(event: TripTransitionEvent, guard: StateTransitionGuard): void {
        const key = event;
        if (!this.guards.has(key)) {
            this.guards.set(key, []);
        }
        this.guards.get(key)!.push(guard);
    }

    beforeTransition(
        event: TripTransitionEvent,
        hook: StateTransitionHook,
    ): void {
        const key = event;
        if (!this.beforeHooks.has(key)) {
            this.beforeHooks.set(key, []);
        }
        this.beforeHooks.get(key)!.push(hook);
    }

    afterTransition(
        event: TripTransitionEvent,
        hook: StateTransitionHook,
    ): void {
        const key = event;
        if (!this.afterHooks.has(key)) {
            this.afterHooks.set(key, []);
        }
        this.afterHooks.get(key)!.push(hook);
    }

    async transition(
        currentState: TripStatus,
        event: TripTransitionEvent,
        context: TripStateMachineContext,
    ): Promise<TripStatus> {
        if (!this.canTransition(currentState, event)) {
            // Недопустимый переход — бизнес-кейс (двойной start/complete),
            // клиенту уходит 400, а не 500
            const error = new BadRequestError(
                `Invalid state transition: ${currentState} -> ${event}. Trip ${context.tripId}`,
                ErrorCode.TRIP_INVALID_TRANSITION,
            );
            logger.error(
                {
                    tripId: context.tripId,
                    currentState,
                    event,
                    allowedTransitions: Array.from(
                        ALLOWED_TRANSITIONS.get(currentState)?.keys() || [],
                    ),
                },
                'Invalid trip state transition attempt',
            );
            throw error;
        }

        const targetState = this.getTargetState(currentState, event)!;

        const guards = this.guards.get(event) || [];
        for (const guard of guards) {
            const canProceed = await guard(context);
            if (!canProceed) {
                const error = new BadRequestError(
                    `State transition guard failed: ${currentState} -> ${targetState} via ${event}. Trip ${context.tripId}`,
                    ErrorCode.TRIP_INVALID_TRANSITION,
                );
                logger.warn(
                    {
                        tripId: context.tripId,
                        currentState,
                        targetState,
                        event,
                    },
                    'Trip state transition blocked by guard',
                );
                throw error;
            }
        }

        const beforeHooks = this.beforeHooks.get(event) || [];
        for (const hook of beforeHooks) {
            await hook(context);
        }

        logger.info(
            {
                tripId: context.tripId,
                from: currentState,
                to: targetState,
                event,
            },
            'Trip state transition',
        );

        const afterHooks = this.afterHooks.get(event) || [];
        for (const hook of afterHooks) {
            await hook(context);
        }

        return targetState;
    }

    getAvailableEvents(currentState: TripStatus): TripTransitionEvent[] {
        const transitions = ALLOWED_TRANSITIONS.get(currentState);
        if (!transitions) {
            return [];
        }
        return Array.from(transitions.keys());
    }

    isFinalState(state: TripStatus): boolean {
        return state === TripStatus.Completed || state === TripStatus.Canceled;
    }
}

export const tripStateMachine = new TripStateMachine();

// Пример регистрации guards
tripStateMachine.addGuard(TripTransitionEvent.START_TRIP, async (context) => {
    // Можно добавить дополнительные проверки, например:
    // - Проверка, что есть хотя бы одно бронирование
    // - Проверка, что время отправления наступило
    // - Проверка, что водитель не забанен
    return true;
});

// Пример after hooks для уведомлений, логирования и т.д.
tripStateMachine.afterTransition(
    TripTransitionEvent.START_TRIP,
    async (context) => {
        logger.info(
            { tripId: context.tripId, driverId: context.driverId },
            'Trip started - sending notifications to passengers',
        );
        // Здесь можно отправить уведомления пассажирам
    },
);

tripStateMachine.afterTransition(
    TripTransitionEvent.COMPLETE_TRIP,
    async (context) => {
        logger.info(
            { tripId: context.tripId, driverId: context.driverId },
            'Trip completed - triggering payment processing and rating prompts',
        );
        // Здесь можно запустить процесс оплаты, отправить запросы на рейтинг и т.д.
    },
);

tripStateMachine.afterTransition(
    TripTransitionEvent.AUTO_COMPLETE_TRIP,
    async (context) => {
        logger.info(
            {
                tripId: context.tripId,
                driverId: context.driverId,
                originalStatus: context.metadata?.originalStatus,
            },
            'Trip auto-completed by stale trip sweep (driver never confirmed)',
        );
    },
);