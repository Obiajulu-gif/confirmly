-- Distance-based delivery: merchant pricing settings, the customer's last
-- shared location pin, and the pin/distance an order was priced from.

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "storeLatitude" DOUBLE PRECISION,
ADD COLUMN "storeLongitude" DOUBLE PRECISION,
ADD COLUMN "deliveryBaseFeeKobo" INTEGER,
ADD COLUMN "deliveryPerKmKobo" INTEGER,
ADD COLUMN "deliveryMaxKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "lastLatitude" DOUBLE PRECISION,
ADD COLUMN "lastLongitude" DOUBLE PRECISION,
ADD COLUMN "lastLocationLabel" TEXT,
ADD COLUMN "lastLocationAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN "deliveryLongitude" DOUBLE PRECISION,
ADD COLUMN "deliveryDistanceKm" DOUBLE PRECISION;
