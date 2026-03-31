
import { useGameBridge } from './gameBridge';
import { executeValueHook } from '../engine/relicEngine';

// Shim for legacy GameStore
// Wraps useGameBridge and exposes legacy API to App.tsx

export const useGameStore = <T>(selector?: (state: any) => T): any => {
    // 1. Get state from bridge
    const bridgeState = useGameBridge();
    const { gameState, dispatch } = bridgeState;

    // 2. Derive legacy properties that might be computed getters in old store
    const getProjectedDrawCount = () => {
        let drawCount = 1 + gameState.modifiers.drawCountMod;
        drawCount = executeValueHook('getDrawCount', drawCount, { inventory: gameState.inventory as any, dryRun: true });
        return drawCount;
    };

    const getProjectedPlaceCount = () => {
        let placeCount = 1 + gameState.modifiers.placeCountMod;
        placeCount = executeValueHook('getPlaceCount', placeCount, { inventory: gameState.inventory as any, dryRun: true });
        return placeCount;
    };

    const getMaxCharms = () => executeValueHook('getMaxCharms', 5, { inventory: gameState.inventory as any, dryRun: true });
    const getMaxAngles = () => executeValueHook('getMaxAngles', 5, { inventory: gameState.inventory as any, dryRun: true });

    // 3. Construct the full legacy state object
    const legacyState = {
        // ... Spread game state directly (engine GameState ~legacy GameState)
        ...gameState,

        // ... Spread bridge UI props (animationSpeed, sfx triggers, etc.)
        ...bridgeState,

        // ... Explicit Action Mappings ...
        startGame: (gamblerId: string, cityId: string, options?: any) => 
            dispatch({ 
                type: 'start_game', 
                gamblerId, 
                cityId, 
                seed: Date.now(),
                globalTutorialsCompleted: options?.globalTutorialsCompleted,
                skipAtlanticTutorials: options?.skipAtlanticTutorials
            }),
        
        dealFirstHand: () => dispatch({ type: 'deal' }),
        drawCard: () => dispatch({ type: 'draw' }),
        assignCard: (handIndex: number) => dispatch({ type: 'place_card', handIndex }),
        selectDrawnCard: (index: number) => dispatch({ type: 'select_drawn_card', drawIndex: index }),
        
        holdReturns: (_forceDealerBust?: boolean) => dispatch({ type: 'stand' }), // 'forceDealerBust' ignored in pure engine unless debug action?
        nextDeal: (forceContinue?: boolean) => dispatch({ type: 'deal', forceContinue }),
        completeDealEarly: () => dispatch({ type: 'complete_deal_early' }),
        leaveCasino: () => dispatch({ type: 'leave_casino' }),

        // Table Actions
        startTableAction: (relicId: string) => dispatch({ type: 'activate_table_action', relicId }),
        cancelTableAction: () => dispatch({ type: 'cancel_table_action' }),
        selectTableActionHand: (handIndex: number) => dispatch({ type: 'select_table_action_target', handIndex }),
        selectTableActionCard: (payload: any) => dispatch({ type: 'select_table_action_card', ...payload }),
        selectTableActionDrawCard: (drawIndex: number) => dispatch({ type: 'select_table_action_draw_card', drawIndex }),
        
        // Shop Actions
        enterGiftShop: () => dispatch({ type: 'enter_gift_shop' }),
        buyShopItem: (itemId: string) => dispatch({ type: 'buy_shop_item', itemId }),
        restockGiftShop: () => dispatch({ type: 'restock_shop' }),
        sellRelic: (relicId: string, index: number) => dispatch({ type: 'sell_relic', relicId, index }), // Legacy might use (instanceId, index) -> new uses (relicId, index) or just index?
        // New Engine 'sell_relic' action expects { relicId, index }. 
        // Legacy: sellRelic(instanceId, index). 
        // Engine action signature: { type: 'sell_relic', relicId, index }
        // We'll pass both if possible or map correctly.
        
        leaveShop: () => dispatch({ type: 'leave_shop' }),
        enhanceCard: (cardId: string, effect: any) => dispatch({ type: 'enhance_card', cardId, enhancement: effect }),
        destroyCard: (cardId: string) => dispatch({ type: 'destroy_card', cardId }),
        removeCard: (cardId: string) => dispatch({ type: 'destroy_card', cardId }), // Alias?
        deductRemovalCost: () => {}, // Engine handles cost deduction in destroy_card action automatically.

        // Debug
        triggerDebugChips: () => {
             // If in shop, give comps. Otherwise, give score/win.
             if (gameState.phase === 'gift_shop') {
                 dispatch({ type: 'debug_give_cash', amount: 50 });
             } else {
                 const targetNeeded = gameState.targetScore - gameState.totalScore;
                 const amount = Math.max(0, Math.ceil(targetNeeded / 2));
                 dispatch({ type: 'debug_give_cash', amount: amount || 100 });
             }
        },
        debugWin: () => dispatch({ type: 'debug_win' }),
        debugUndo: () => dispatch({ type: 'debug_undo' }),
        debugAddRelic: (relicId: string) => dispatch({ type: 'debug_add_relic', relicId }),
        addRelic: (relicId: string) => dispatch({ type: 'debug_add_relic', relicId }),
        removeRelic: (relicId: string) => dispatch({ type: 'debug_remove_relic', relicId }),
        debugFillTableAction: (relicId: string) => dispatch({ type: 'debug_fill_charges', relicId }),
        drawSpecificCard: (cardId: string) => dispatch({ type: 'debug_draw_card', cardId }),

        // Selectors / Helpers
        getProjectedDrawCount,
        getProjectedPlaceCount,
        getMaxCharms,
        getMaxAngles,
        
        // Tutorial Bridge
        // App.tsx calls these:
        checkTutorials: () => {
             // Engine checks automatically on actions ?
             // Or we can trigger a check?
             // Since engine is pure, 'checkTutorials' action doesn't exist.
             // But 'acknowledge_tutorial' checks.
             // We can do nothing here as engine is reactive.
        },
        registerTutorials: () => {}, // No-op, engine has built-in definitions
        isTutorialInputLocked: () => gameState.tutorial?.activeStepId ? true : false, // Approx
        onTutorialContinue: () => {}, // Legacy callback registration - not supported in new engine
        
        // Signal event mapping
        signalTotalWinningsAnimationComplete: () => dispatch({ type: 'signal_animation_complete', animationId: 'total_winnings_shown' }),
        onInitialDealAnimationsComplete: () => dispatch({ type: 'signal_animation_complete', animationId: 'dealer_initial_deal_complete' }),


        setDrawTutorialReady: (_ready: boolean) => {}, // No-op? Or dispatch action? 
                                                      // 'mark_draw_tutorial_ready' was an action in legacy.
                                                      // If tutorial needs it, we might need an action.
                                                      // Check definitions.ts for 'draw_indicator' trigger.
                                                      
        // Other UI
        toggleSellingMode: (enabled: boolean) => bridgeState.toggleSellingMode && bridgeState.toggleSellingMode(enabled),
        rewardRelicSell: (_relicId: string) => {}, // Handled by engine processSellRelic event?
        goToTitle: () => bridgeState.reset(),
        winGame: () => dispatch({ type: 'debug_victory' }),
    };

    if (selector) {
        return selector(legacyState);
    }
    return legacyState;
};
