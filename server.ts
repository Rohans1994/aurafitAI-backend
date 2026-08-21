import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { requireAuth } from './auth';
import {
    analyzeMealImage,
    parseMealText,
    generateWeeklyMealPlan,
    generateWeeklyWorkoutPlan,
    generateGroceryList,
    generateMealAlternative,
    recalibrateRemainingPlan,
    generateDailyWorkout,
    generateSpecializedWorkout,
    getCoachingAdvice,
    createLiveSessionToken
} from './services/ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8081;

// Comma-separated list of allowed origins, e.g. "https://localhost,http://localhost:3000,https://aurafit.app"
// "https://localhost" is Capacitor's default Android/iOS WebView origin.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://localhost,http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile native shells, health checks)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    }
}));
app.use(express.json({ limit: '15mb' })); // meal photos are base64-encoded in the request body

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// All AI routes require a valid Firebase ID token (Authorization: Bearer <token>).
// The frontend already has a signed-in Firebase user for every screen that calls these,
// so this just forwards that same token instead of embedding a Gemini API key client-side.
const aiRouter = express.Router();
aiRouter.use(requireAuth);

aiRouter.post('/analyze-meal-image', async (req, res) => {
    try {
        const { base64Image, profile } = req.body;
        const data = await analyzeMealImage(base64Image, profile);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /analyze-meal-image:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/parse-meal-text', async (req, res) => {
    try {
        const { text, profile } = req.body;
        const data = await parseMealText(text, profile);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /parse-meal-text:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/weekly-meal-plan', async (req, res) => {
    try {
        const { profile } = req.body;
        const data = await generateWeeklyMealPlan(profile);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /weekly-meal-plan:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/weekly-workout-plan', async (req, res) => {
    try {
        const { profile } = req.body;
        const data = await generateWeeklyWorkoutPlan(profile);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /weekly-workout-plan:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/grocery-list', async (req, res) => {
    try {
        const { mealPlan } = req.body;
        const data = await generateGroceryList(mealPlan);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /grocery-list:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/meal-alternative', async (req, res) => {
    try {
        const { profile, type, currentMeal } = req.body;
        const data = await generateMealAlternative(profile, type, currentMeal);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /meal-alternative:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/recalibrate-workout-plan', async (req, res) => {
    try {
        const { profile, currentPlan, missedDays } = req.body;
        const data = await recalibrateRemainingPlan(profile, currentPlan, missedDays);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /recalibrate-workout-plan:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/daily-workout', async (req, res) => {
    try {
        const { profile, fatigueLevel, historyNotes } = req.body;
        const data = await generateDailyWorkout(profile, fatigueLevel, historyNotes);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /daily-workout:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/specialized-workout', async (req, res) => {
    try {
        const { profile, target, muscles } = req.body;
        const data = await generateSpecializedWorkout(profile, target, muscles);
        res.json(data);
    } catch (error: any) {
        console.error('Error in /specialized-workout:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/coaching-advice', async (req, res) => {
    try {
        const { profile, dailyStats, message } = req.body;
        const advice = await getCoachingAdvice(profile, dailyStats, message);
        res.json({ advice });
    } catch (error: any) {
        console.error('Error in /coaching-advice:', error);
        res.status(500).json({ error: error.message });
    }
});

aiRouter.post('/live-session-token', async (_req, res) => {
    try {
        const data = await createLiveSessionToken();
        res.json(data);
    } catch (error: any) {
        console.error('Error in /live-session-token:', error);
        res.status(500).json({ error: error.message });
    }
});

app.use('/ai', aiRouter);

app.listen(PORT, () => {
    console.log(`AuraFit backend running on port ${PORT}`);
});
