from pathlib import Path


def insert_before_nth(text: str, needle: str, insertion: str, occurrence: int) -> str:
    start = 0
    index = -1
    for _ in range(occurrence):
        index = text.find(needle, start)
        if index < 0:
            raise SystemExit(f"Marker occurrence {occurrence} missing: {needle!r}")
        start = index + len(needle)
    return text[:index] + insertion + text[index:]


# ---------------------------------------------------------------------------
# Quantity selections are already converted to deterministic text by the
# WhatsApp catalogue layer. Parse obvious commands locally before waiting for
# the remote order-intent model, so a list selection responds immediately.
# ---------------------------------------------------------------------------
nvidia_path = Path("lib/ai/nvidia.ts")
nvidia = nvidia_path.read_text()
fast_path = '''  const deterministic = fallbackExtract(message);
  if (deterministic.intent !== "OTHER") {
    return { intent: deterministic, source: "fallback" };
  }

'''
marker = '''  const system = buildExtractionSystemPrompt(catalogueHint);
'''
if "const deterministic = fallbackExtract(message);" not in nvidia:
    if marker not in nvidia:
        raise SystemExit("NVIDIA extraction marker missing")
    nvidia = nvidia.replace(marker, fast_path + marker, 1)
nvidia_path.write_text(nvidia)


# ---------------------------------------------------------------------------
# Generate a product illustration immediately after create/update. The worker
# only touches missing/AI images, so merchant uploads and external images remain
# authoritative.
# ---------------------------------------------------------------------------
actions_path = Path("app/dashboard/products/actions.ts")
actions = actions_path.read_text()
if 'import { defer } from "@/lib/defer";' not in actions:
    actions = actions.replace(
        'import { prisma } from "@/lib/db";\n',
        'import { prisma } from "@/lib/db";\n'
        'import { defer } from "@/lib/defer";\n'
        'import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";\n',
        1,
    )

create_hook = '''  defer(() =>
    prewarmProductImages({
      merchantId: session.merchantId,
      productIds: [product.id],
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );

'''
create_start = actions.find("export async function createProductAction")
create_end = actions.find("export async function updateProductAction")
if create_start < 0 or create_end < 0:
    raise SystemExit("Product create/update action markers missing")
create_section = actions[create_start:create_end]
if "productIds: [product.id]" not in create_section:
    revalidate = '  revalidatePath("/dashboard/products");\n'
    position = actions.find(revalidate, create_start, create_end)
    if position < 0:
        raise SystemExit("Create product revalidation marker missing")
    actions = actions[:position] + create_hook + actions[position:]
    create_end += len(create_hook)

update_hook = '''  defer(() =>
    prewarmProductImages({
      merchantId: session.merchantId,
      productIds: [id],
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );

'''
update_start = actions.find("export async function updateProductAction")
update_end = actions.find("export async function duplicateProductAction")
if update_start < 0 or update_end < 0:
    raise SystemExit("Product update/duplicate action markers missing")
update_section = actions[update_start:update_end]
if "productIds: [id]" not in update_section:
    revalidate = '  revalidatePath("/dashboard/products");\n'
    position = actions.find(revalidate, update_start, update_end)
    if position < 0:
        raise SystemExit("Update product revalidation marker missing")
    actions = actions[:position] + update_hook + actions[position:]
actions_path.write_text(actions)


# ---------------------------------------------------------------------------
# Start one non-blocking image job as soon as a customer enters a store. This
# backfills old catalogues between daily cron runs without delaying WhatsApp.
# ---------------------------------------------------------------------------
commerce_path = Path("lib/whatsapp/commerce-menu.ts")
commerce = commerce_path.read_text()
if 'import { defer } from "@/lib/defer";' not in commerce:
    commerce = commerce.replace(
        'import { randomBytes } from "node:crypto";\n',
        'import { randomBytes } from "node:crypto";\n'
        'import { defer } from "@/lib/defer";\n'
        'import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";\n',
        1,
    )

catalogue_marker = '''async function sendCatalogue(
  waId: string,
  context: StoreContext
): Promise<void> {
'''
catalogue_hook = '''  defer(() =>
    prewarmProductImages({
      merchantId: context.merchant.id,
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );
'''
if "merchantId: context.merchant.id,\n      limit: 1,\n      autoApprove: true" not in commerce:
    if catalogue_marker not in commerce:
        raise SystemExit("WhatsApp catalogue marker missing")
    commerce = commerce.replace(
        catalogue_marker,
        catalogue_marker + catalogue_hook,
        1,
    )
commerce_path.write_text(commerce)


# ---------------------------------------------------------------------------
# Keep local secret import/sync aware of the dedicated FLUX key and cron secret.
# No secret value is ever printed or committed.
# ---------------------------------------------------------------------------
import_path = Path("scripts/import-local-secrets.mjs")
secret_import = import_path.read_text()
if "flux.*NVIDIA_IMAGE_API_KEY" not in secret_import:
    secret_import = secret_import.replace(
        '  [/(nvidia|nemotron|nim).*(api\\s*key|key)/i, "NVIDIA_API_KEY"],\n',
        '  [/(black[- ]?forest|flux).*(api\\s*key|key)/i, "NVIDIA_IMAGE_API_KEY"],\n'
        '  [/(nvidia|nemotron|nim).*(api\\s*key|key)/i, "NVIDIA_API_KEY"],\n',
        1,
    )
if '  "CRON_SECRET",\n' not in secret_import:
    generated_marker = '  "WHATSAPP_VERIFY_TOKEN",\n  "DEMO_MERCHANT_PASSWORD",\n'
    if generated_marker in secret_import:
        secret_import = secret_import.replace(
            generated_marker,
            '  "WHATSAPP_VERIFY_TOKEN",\n  "CRON_SECRET",\n  "DEMO_MERCHANT_PASSWORD",\n',
            1,
        )
if '  "NVIDIA_IMAGE_API_KEY",\n' not in secret_import:
    canonical_marker = '  "NVIDIA_ORDER_MODEL",\n'
    if canonical_marker in secret_import:
        secret_import = secret_import.replace(
            canonical_marker,
            canonical_marker
            + '  "NVIDIA_IMAGE_API_KEY",\n'
            + '  "NVIDIA_IMAGE_BASE_URL",\n'
            + '  "NVIDIA_IMAGE_MODEL",\n'
            + '  "NVIDIA_IMAGE_WIDTH",\n'
            + '  "NVIDIA_IMAGE_HEIGHT",\n'
            + '  "NVIDIA_IMAGE_STEPS",\n'
            + '  "NVIDIA_IMAGE_TIMEOUT_MS",\n'
            + '  "NVIDIA_IMAGE_GENERATION_ENABLED",\n',
            1,
        )
if '  "CRON_SECRET",\n  "SENTRY_DSN",' not in secret_import:
    secret_import = secret_import.replace(
        '  "SENTRY_DSN",\n',
        '  "CRON_SECRET",\n  "SENTRY_DSN",\n',
        1,
    )
import_path.write_text(secret_import)

sync_path = Path("scripts/sync-vercel-env.mjs")
sync = sync_path.read_text()
if '  "NVIDIA_IMAGE_API_KEY",\n' not in sync:
    marker = '  "NVIDIA_ORDER_MODEL",\n'
    if marker not in sync:
        raise SystemExit("Vercel NVIDIA sync marker missing")
    sync = sync.replace(
        marker,
        marker
        + '  "NVIDIA_IMAGE_API_KEY",\n'
        + '  "NVIDIA_IMAGE_BASE_URL",\n'
        + '  "NVIDIA_IMAGE_MODEL",\n'
        + '  "NVIDIA_IMAGE_WIDTH",\n'
        + '  "NVIDIA_IMAGE_HEIGHT",\n'
        + '  "NVIDIA_IMAGE_STEPS",\n'
        + '  "NVIDIA_IMAGE_TIMEOUT_MS",\n'
        + '  "NVIDIA_IMAGE_GENERATION_ENABLED",\n'
        + '  "ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES",\n'
        + '  "PRODUCT_IMAGE_MAX_BYTES",\n',
        1,
    )
if '  "CRON_SECRET",\n' not in sync:
    sync = sync.replace(
        '  "DEMO_MODE",\n',
        '  "CRON_SECRET",\n  "DEMO_MODE",\n',
        1,
    )
sync_path.write_text(sync)

example_path = Path(".env.example")
example = example_path.read_text()
if "CRON_SECRET=" not in example:
    example += "\n# Vercel Cron authentication\nCRON_SECRET=\n"
example_path.write_text(example)
