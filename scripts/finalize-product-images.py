from pathlib import Path

schema_path = Path("prisma/schema.prisma")
schema = schema_path.read_text()
audit = '''enum AuditActor {
  SYSTEM
  CUSTOMER
  MERCHANT
  AI
  PROVIDER
}
'''
if "enum ProductImageSource" not in schema:
    replacement = audit + '''
enum ProductImageSource {
  MERCHANT_UPLOAD
  AI_GENERATED
  EXTERNAL_URL
}

enum ProductImageStatus {
  NONE
  PROCESSING
  READY
  FAILED
}
'''
    if audit not in schema:
        raise SystemExit("AuditActor marker missing")
    schema = schema.replace(audit, replacement, 1)

product_old = '''  imageUrl      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  variants   ProductVariant[]
  orderItems OrderItem[]
'''
product_new = '''  imageUrl           String?
  imageSource        ProductImageSource?
  imageStatus        ProductImageStatus @default(NONE)
  imageAltText       String?
  imagePrompt        String?
  imageGeneratedAt   DateTime?
  imageApprovedAt    DateTime?
  imageFailureReason String?
  imageContentHash   String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  variants   ProductVariant[]
  orderItems OrderItem[]
  imageAsset ProductImageAsset?
'''
if "imageSource" not in schema:
    if product_old not in schema:
        raise SystemExit("Product marker missing")
    schema = schema.replace(product_old, product_new, 1)

if "model ProductImageAsset" not in schema:
    variant_marker = "model ProductVariant {\n"
    asset = '''model ProductImageAsset {
  id          String   @id @default(cuid())
  productId   String   @unique
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  merchantId  String
  bytes       Bytes
  contentType String
  sizeBytes   Int
  sha256      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([merchantId])
}

'''
    if variant_marker not in schema:
        raise SystemExit("ProductVariant marker missing")
    schema = schema.replace(variant_marker, asset + variant_marker, 1)
schema_path.write_text(schema)

env_path = Path("lib/env.ts")
env_text = env_path.read_text()
env_marker = '''  NVIDIA_ORDER_MODEL: z.string().default("nvidia/nemotron-3-nano-30b-a3b"),
'''
if "NVIDIA_IMAGE_API_KEY" not in env_text:
    image_env = env_marker + '''
  NVIDIA_IMAGE_API_KEY: z.string().min(1).optional(),
  NVIDIA_IMAGE_BASE_URL: z.string().url().default("https://ai.api.nvidia.com"),
  NVIDIA_IMAGE_MODEL: z.string().default("black-forest-labs/flux.1-schnell"),
  NVIDIA_IMAGE_WIDTH: z.coerce.number().int().min(256).max(2048).default(1024),
  NVIDIA_IMAGE_HEIGHT: z.coerce.number().int().min(256).max(2048).default(1024),
  NVIDIA_IMAGE_STEPS: z.coerce.number().int().min(1).max(4).default(4),
  NVIDIA_IMAGE_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
  NVIDIA_IMAGE_GENERATION_ENABLED: z
    .string()
    .transform((value) => value !== "false" && value !== "0")
    .default("true"),
  ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .default("false"),
  PRODUCT_IMAGE_MAX_BYTES: z.coerce.number().int().min(100_000).max(4_194_304).default(4_194_304),
'''
    if env_marker not in env_text:
        raise SystemExit("NVIDIA env marker missing")
    env_text = env_text.replace(env_marker, image_env, 1)
env_path.write_text(env_text)

example_path = Path(".env.example")
example = example_path.read_text()
example_marker = "NVIDIA_ORDER_MODEL=nvidia/nemotron-3-nano-30b-a3b\n"
if "NVIDIA_IMAGE_API_KEY" not in example:
    example_add = example_marker + '''NVIDIA_IMAGE_API_KEY=
NVIDIA_IMAGE_BASE_URL=https://ai.api.nvidia.com
NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-schnell
NVIDIA_IMAGE_WIDTH=1024
NVIDIA_IMAGE_HEIGHT=1024
NVIDIA_IMAGE_STEPS=4
NVIDIA_IMAGE_TIMEOUT_MS=45000
NVIDIA_IMAGE_GENERATION_ENABLED=true
ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES=false
PRODUCT_IMAGE_MAX_BYTES=4194304
'''
    if example_marker not in example:
        raise SystemExit(".env example marker missing")
    example = example.replace(example_marker, example_add, 1)
example_path.write_text(example)

client_path = Path("lib/whatsapp/client.ts")
client = client_path.read_text()
if "sendImageByUrl" not in client:
    button_marker = "export interface InteractiveButton {\n"
    sender = '''export async function sendImageByUrl(
  to: string,
  input: { imageUrl: string; caption?: string }
): Promise<SendResult> {
  const url = new URL(input.imageUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())
  ) {
    throw new WhatsAppSendError("invalid public image URL", null, null);
  }
  return post({
    to,
    type: "image",
    image: {
      link: url.toString(),
      ...(input.caption ? { caption: input.caption.slice(0, 1024) } : {}),
    },
  });
}

'''
    if button_marker not in client:
        raise SystemExit("WhatsApp client marker missing")
    client = client.replace(button_marker, sender + button_marker, 1)
client_path.write_text(client)

commerce_path = Path("lib/whatsapp/commerce-menu.ts")
commerce = commerce_path.read_text()
commerce = commerce.replace(
    '''  sendFlow,
  sendList,
  sendText,
''',
    '''  sendButtons,
  sendFlow,
  sendImageByUrl,
  sendList,
  sendText,
''',
    1,
)

if "async function previewProductSelection(" not in commerce:
    start = commerce.index("async function forwardProductSelection(")
    end = commerce.index("\nasync function handleFlowReply(", start)
    preview = r'''async function productForSelection(
  productId: string,
  context: StoreContext
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gt: 0 },
    },
    include: { variants: true },
  });
}

function productDetails(product: {
  name: string;
  description: string | null;
  priceKobo: number;
  stockQuantity: number;
  variants: Array<{ colour: string | null; size: string | null }>;
}) {
  const colours = [
    ...new Set(
      product.variants
        .map((variant) => variant.colour)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const sizes = [
    ...new Set(
      product.variants
        .map((variant) => variant.size)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  return {
    text: [
      `*${product.name}*`,
      formatNaira(product.priceKobo),
      [colours.join(", "), sizes.join(", ")].filter(Boolean).join(" · "),
      `${product.stockQuantity} in stock`,
      product.description ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function previewProductSelection(
  message: ParsedInboundMessage,
  productId: string,
  context: StoreContext
): Promise<CommerceMenuResult> {
  const product = await productForSelection(productId, context);
  if (!product) {
    await sendText(
      message.from,
      "That product is no longer available. Send MENU to browse again."
    );
    return { handled: true };
  }

  const details = productDetails(product);
  const allowGenerated =
    product.imageSource !== "AI_GENERATED" ||
    Boolean(product.imageApprovedAt) ||
    env().ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES;
  const disclosure =
    product.imageSource === "AI_GENERATED"
      ? "AI-generated product illustration — actual item may vary."
      : product.imageSource === "MERCHANT_UPLOAD"
        ? "Merchant-provided product photo."
        : product.imageSource === "EXTERNAL_URL"
          ? "Product image supplied by the merchant."
          : "";

  let imageSent = false;
  if (product.imageUrl && allowGenerated) {
    try {
      await sendImageByUrl(message.from, {
        imageUrl: product.imageUrl,
        caption: [details.text, disclosure].filter(Boolean).join("\n\n"),
      });
      imageSent = true;
      logger.info("product image sent on WhatsApp", {
        merchantId: context.merchant.id,
        productId: product.id,
        source: product.imageSource,
      });
    } catch (error) {
      logger.warn("product image send failed; continuing with text", {
        merchantId: context.merchant.id,
        productId: product.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (!imageSent) {
    const unavailable =
      product.imageSource === "AI_GENERATED" && !allowGenerated
        ? "The AI illustration is waiting for merchant approval."
        : "The merchant has not added a customer-ready product photo yet.";
    await sendText(message.from, `${details.text}\n\n${unavailable}`);
  }

  await sendButtons(message.from, "What would you like to do?", [
    { id: `commerce:add:${product.id}:1`, title: "Add 1 to order" },
    { id: `commerce:quantity:${product.id}`, title: "Choose quantity" },
    { id: "commerce:products_back", title: "Back to products" },
  ]);
  return { handled: true };
}

async function forwardProductQuantity(
  message: ParsedInboundMessage,
  productId: string,
  quantity: number,
  context: StoreContext
): Promise<CommerceMenuResult> {
  const product = await productForSelection(productId, context);
  if (!product || quantity < 1 || quantity > Math.min(10, product.stockQuantity)) {
    await sendText(
      message.from,
      "That product or quantity is no longer available. Send MENU to browse again."
    );
    return { handled: true };
  }
  return {
    handled: false,
    forwardedMessage: {
      ...message,
      kind: "text",
      text: `I want ${quantity} ${product.name}`,
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "interactive.product_selection",
    },
  };
}

async function sendQuantityOptions(
  message: ParsedInboundMessage,
  productId: string,
  context: StoreContext
): Promise<void> {
  const product = await productForSelection(productId, context);
  if (!product) {
    await sendText(message.from, "That product is no longer available.");
    return;
  }
  const maximum = Math.min(9, product.stockQuantity);
  await sendList(
    message.from,
    `Choose the quantity of ${product.name}.`,
    "Choose quantity",
    [
      ...Array.from({ length: maximum }, (_, index) => ({
        id: `commerce:qty:${product.id}:${index + 1}`,
        title: `${index + 1}`,
        description: `${index + 1} × ${formatNaira(product.priceKobo)}`,
      })),
      { id: "commerce:products_back", title: "Back to products" },
    ].slice(0, 10)
  );
}
'''
    commerce = commerce[:start] + preview + commerce[end:]

old_handler = '''  if (interactiveId.startsWith("commerce:product:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    return forwardProductSelection(
      message,
      interactiveId.slice("commerce:product:".length),
      context
    );
  }
'''
if old_handler in commerce:
    new_handler = '''  if (interactiveId === "commerce:products_back") {
    if (context) await sendProducts(message.from, context, null);
    else await sendStoreDirectory(message.from);
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:add:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    const parts = interactiveId.split(":");
    return forwardProductQuantity(
      message,
      parts[2] ?? "",
      Number(parts[3] ?? 1),
      context
    );
  }

  if (interactiveId.startsWith("commerce:quantity:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    await sendQuantityOptions(
      message,
      interactiveId.slice("commerce:quantity:".length),
      context
    );
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:qty:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    const parts = interactiveId.split(":");
    return forwardProductQuantity(
      message,
      parts[2] ?? "",
      Number(parts[3] ?? 0),
      context
    );
  }

  if (interactiveId.startsWith("commerce:product:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    return previewProductSelection(
      message,
      interactiveId.slice("commerce:product:".length),
      context
    );
  }
'''
    commerce = commerce.replace(old_handler, new_handler, 1)
commerce_path.write_text(commerce)

health_path = Path("app/api/health/route.ts")
health = health_path.read_text()
health = health.replace(
    'import { integrationStatus, isDemoMode } from "@/lib/env";',
    'import { env, integrationStatus, isDemoMode } from "@/lib/env";',
    1,
)
if "productImages:" not in health:
    marker = "        monnify: integrations.monnify,\n"
    addition = marker + '''        productImages: {
          storage: "database",
          generationEnabled: env().NVIDIA_IMAGE_GENERATION_ENABLED,
          nvidiaConfigured: Boolean(
            env().NVIDIA_IMAGE_API_KEY ?? env().NVIDIA_API_KEY
          ),
        },
'''
    if marker not in health:
        raise SystemExit("Health marker missing")
    health = health.replace(marker, addition, 1)
health_path.write_text(health)
