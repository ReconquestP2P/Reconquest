import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

// =====================================================
// PLATFORM KEY VALIDATION - Must pass before server starts
// =====================================================
function validatePlatformKey(): string {
  const privkey = process.env.PLATFORM_SIGNING_KEY;
  
  if (!privkey) {
    throw new Error('❌ PLATFORM_SIGNING_KEY missing! App cannot start. Set this secret in Replit Secrets.');
  }
  
  if (privkey.length !== 64) {
    throw new Error(`❌ PLATFORM_SIGNING_KEY invalid length (${privkey.length} chars, expected 64)! App cannot start.`);
  }
  
  try {
    const key = ECPair.fromPrivateKey(Buffer.from(privkey, 'hex'));
    const pubkey = Buffer.from(key.publicKey).toString('hex');
    
    // Test signing works
    const testMsg = Buffer.alloc(32, 0x01); // 32-byte test message
    const sig = key.sign(testMsg);
    const valid = ecc.verify(testMsg, key.publicKey, sig);
    
    if (!valid) {
      throw new Error('❌ Platform key signing test failed! App cannot start.');
    }
    
    console.log('✅ Platform key validated successfully');
    console.log(`   Public key: ${pubkey}`);
    return pubkey;
  } catch (error: any) {
    throw new Error(`❌ Platform key validation failed: ${error.message}. App cannot start.`);
  }
}

// Validate platform key before starting server
const VALIDATED_PLATFORM_PUBKEY = validatePlatformKey();

// Export for use by other services
export { VALIDATED_PLATFORM_PUBKEY };

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
