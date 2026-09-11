"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface VisualCardData {
  id: string;
  imageUrl: string;
  tag: string;
  badge: string;
  title: string;
  chatBubble?: string;
  statusPill?: string;
  gradColor1: string;
  gradColor2: string;
}

const VISUAL_CARDS: VisualCardData[] = [
  {
    id: "whatsapp-customer",
    imageUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    tag: "Customer Chat",
    badge: "WhatsApp",
    title: "Customer orders in plain chat",
    chatBubble: "START ADASTYLES — 2 black polos, large, to Yaba",
    gradColor1: "#105346",
    gradColor2: "#17c19a",
  },
  {
    id: "product-catalogue",
    imageUrl: "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&auto=format&fit=crop&q=80",
    tag: "Store Catalogue",
    badge: "Ada Styles",
    title: "Catalogue prices calculated automatically",
    statusPill: "2 × Polo Shirts (L) · ₦24,000",
    gradColor1: "#1f2937",
    gradColor2: "#0d8067",
  },
  {
    id: "monnify-payment",
    imageUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&auto=format&fit=crop&q=80",
    tag: "Monnify Payment",
    badge: "100% Verified",
    title: "Server verified bank checkout",
    statusPill: "₦26,500 · Monnify PAID",
    gradColor1: "#0f6553",
    gradColor2: "#17c19a",
  },
  {
    id: "anti-fraud",
    imageUrl: "https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=600&auto=format&fit=crop&q=80",
    tag: "Anti-Fraud Guard",
    badge: "Dispute Proof",
    title: "Never ship against fake payment screenshots",
    chatBubble: "Screenshot claims rejected · Provider verified",
    gradColor1: "#7f1d1d",
    gradColor2: "#a9000c",
  },
  {
    id: "digital-receipt",
    imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80",
    tag: "Digital Receipt",
    badge: "QR Scannable",
    title: "Cryptographic proof issued to customer",
    statusPill: "Receipt #CF-8942 · VALID",
    gradColor1: "#111827",
    gradColor2: "#17c19a",
  },
  {
    id: "merchant-hub",
    imageUrl: "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=600&auto=format&fit=crop&q=80",
    tag: "Merchant Backoffice",
    badge: "Live Orders",
    title: "One dashboard for all WhatsApp branch sales",
    statusPill: "Storefront Active · Subaccount Connected",
    gradColor1: "#134e4a",
    gradColor2: "#0f766e",
  },
  {
    id: "bank-settlement",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80",
    tag: "Bank Settlement",
    badge: "Direct Payout",
    title: "Funds settled directly to merchant subaccount",
    statusPill: "Settlement 100% routed to your bank",
    gradColor1: "#064e3b",
    gradColor2: "#10b981",
  },
  {
    id: "delivery-customer",
    imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80",
    tag: "Order Fulfilment",
    badge: "Dispatched",
    title: "Real-time updates delivered on WhatsApp",
    chatBubble: "Your order has been verified and dispatched!",
    gradColor1: "#1e1b4b",
    gradColor2: "#17c19a",
  },
];

/** Renders an image collage texture with brand overlays */
function createCollageCardTexture(data: VisualCardData): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext("2d")!;

  const texture = new THREE.CanvasTexture(canvas);

  const drawCard = (img?: HTMLImageElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const radius = 52;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.clip();

    // 1. Image or Fallback Gradient
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);

      // Scrim overlay for readability
      const scrim = ctx.createLinearGradient(0, 0, 0, canvas.height);
      scrim.addColorStop(0, "rgba(0, 0, 0, 0.45)");
      scrim.addColorStop(0.35, "rgba(0, 0, 0, 0.15)");
      scrim.addColorStop(0.65, "rgba(0, 0, 0, 0.70)");
      scrim.addColorStop(1, "rgba(0, 0, 0, 0.94)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bgGrad.addColorStop(0, data.gradColor1);
      bgGrad.addColorStop(1, data.gradColor2);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Top Header Pill Badges
    ctx.fillStyle = "#17c19a";
    ctx.beginPath();
    ctx.roundRect(30, 30, 210, 46, 23);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(data.tag.toUpperCase(), 135, 60);

    // Right Badge
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.roundRect(canvas.width - 200, 30, 170, 46, 23);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 19px system-ui, sans-serif";
    ctx.fillText(data.badge, canvas.width - 115, 60);
    ctx.textAlign = "left";

    // 3. Middle Floating UI Element
    if (data.chatBubble) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(30, 380, canvas.width - 60, 95, 20);
      ctx.fill();

      ctx.fillStyle = "#17c19a";
      ctx.beginPath();
      ctx.arc(65, 427, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillText("💬", 54, 433);

      ctx.fillStyle = "#111827";
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.fillText(data.chatBubble, 96, 434);
    } else if (data.statusPill) {
      ctx.fillStyle = "rgba(23, 193, 154, 0.95)";
      ctx.beginPath();
      ctx.roundRect(30, 400, canvas.width - 60, 75, 20);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillText("✓  " + data.statusPill, 55, 446);
    }

    // 4. Bottom Title Text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText(data.title, 34, canvas.height - 60);

    ctx.restore();

    // 5. Outer Rounded Card Border
    ctx.strokeStyle = "rgba(23, 193, 154, 0.4)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, radius);
    ctx.stroke();

    texture.needsUpdate = true;
  };

  drawCard();

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = data.imageUrl;
  img.onload = () => drawCard(img);

  return texture;
}

export function Hero3DCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Three.js Scene setup
    const scene = new THREE.Scene();

    const getResponsiveSettings = () => {
      const w = container.clientWidth || window.innerWidth;
      if (w < 480) {
        return {
          cameraZ: 13.5,
          cameraY: -0.1,
          baseGroupY: 0.35,
          sensitivity: 2.8,
          spacingX: 7.14,
          cardScale: 1.18,
          forwardCurve: 2.6,
        };
      } else if (w < 768) {
        return {
          cameraZ: 13.4,
          cameraY: -0.05,
          baseGroupY: 0.38,
          sensitivity: 2.3,
          spacingX: 6.9,
          cardScale: 1.12,
          forwardCurve: 3.0,
        };
      } else if (w < 1024) {
        return {
          cameraZ: 13.0,
          cameraY: 0,
          baseGroupY: 0.4,
          sensitivity: 1.9,
          spacingX: 6.95,
          cardScale: 1.12,
          forwardCurve: 3.3,
        };
      } else {
        return {
          cameraZ: 12.8,
          cameraY: 0,
          baseGroupY: 0.4,
          sensitivity: 1.8,
          spacingX: 7.15,
          cardScale: 1.18,
          forwardCurve: 3.5,
        };
      }
    };

    const initialSettings = getResponsiveSettings();

    const camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || 500),
      0.1,
      1000
    );
    camera.position.set(0, initialSettings.cameraY, initialSettings.cameraZ);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(5, 12, 8);
    scene.add(dirLight);

    // Carousel 3D Group - lifted slightly up
    const carouselGroup = new THREE.Group();
    carouselGroup.position.y = initialSettings.baseGroupY;
    scene.add(carouselGroup);

    // Create 12 continuous cylindrical slot meshes from visual cards
    const totalSlots = 12;
    const cardMeshes: THREE.Mesh[] = [];
    const geometry = new THREE.PlaneGeometry(2.85, 4.05, 16, 16);

    for (let i = 0; i < totalSlots; i++) {
      const data = VISUAL_CARDS[i % VISUAL_CARDS.length]!;
      const texture = createCollageCardTexture(data);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        roughness: 0.25,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.02,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { index: i };
      carouselGroup.add(mesh);
      cardMeshes.push(mesh);
    }

    const centerDepth = -3.0;

    let currentScroll = 0;
    let targetScroll = 0;
    let isDragging = false;
    let previousMouseX = 0;
    let mouseXNorm = 0;
    let mouseYNorm = 0;

    const updateCardPositions = (scroll: number) => {
      const currentSettings = getResponsiveSettings();
      cardMeshes.forEach((mesh, index) => {
        // Continuous 360-degree angle for each slot
        const theta = (index / totalSlots) * Math.PI * 2 + scroll;
        // Normalize theta to [-PI, PI]
        const normTheta = ((((theta % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2))) - Math.PI;

        const absTheta = Math.abs(normTheta);

        // Visible in front arc (~100 degrees each side)
        if (absTheta < 1.75) {
          mesh.visible = true;
          // Apply responsive card scaling
          mesh.scale.set(currentSettings.cardScale, currentSettings.cardScale, 1);
          // Linear angle mapping guarantees uniform, non-overlapping spacing
          mesh.position.x = normTheta * currentSettings.spacingX;
          // Parabolic depth: center recedes (-3.0), sides curve forward towards camera
          mesh.position.z = centerDepth + (1 - Math.cos(normTheta)) * currentSettings.forwardCurve;
          // Inward perspective rotation
          mesh.rotation.y = -normTheta * 0.38;
          mesh.rotation.x = 0.02;

          // Edge fade out for ultra smooth continuous entry and exit
          const opacity = absTheta > 1.25 ? Math.max(0, 1 - (absTheta - 1.25) * 2.5) : 1;
          (mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
        } else {
          mesh.visible = false;
        }
      });
    };

    // Initial positioning
    updateCardPositions(0);

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      previousMouseX = e.clientX;
      try {
        container.setPointerCapture(e.pointerId);
      } catch {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (e.pointerType === "mouse") {
        mouseXNorm = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseYNorm = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      }

      if (isDragging) {
        const deltaX = e.clientX - previousMouseX;
        const currentSettings = getResponsiveSettings();
        targetScroll += (deltaX / rect.width) * currentSettings.sensitivity;
        previousMouseX = e.clientX;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      isDragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
    };

    container.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Slow ambient drift when not actively dragging
      if (!isDragging) {
        targetScroll += 0.0008;
      }

      // Smooth scroll easing
      currentScroll += (targetScroll - currentScroll) * 0.06;
      updateCardPositions(currentScroll);

      // Parallax mouse tilt (desktop only)
      carouselGroup.rotation.x = mouseYNorm * 0.05;
      carouselGroup.rotation.y = mouseXNorm * 0.03;

      const currentSettings = getResponsiveSettings();
      carouselGroup.position.y = currentSettings.baseGroupY + Math.sin(elapsedTime * 1.5) * 0.06;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || 500;
      const settings = getResponsiveSettings();
      camera.position.z = settings.cameraZ;
      camera.position.y = settings.cameraY;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden select-none py-0">
      {/* 3D WebGL Canvas */}
      <div
        ref={containerRef}
        className="h-[395px] xs:h-[425px] w-full cursor-grab active:cursor-grabbing sm:h-[480px] lg:h-[570px] xl:h-[590px] touch-pan-y"
        aria-label="Confirmly Business and Customer Visual World 3D Carousel"
      />
    </div>
  );
}
