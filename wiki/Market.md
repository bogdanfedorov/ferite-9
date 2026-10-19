# Market

There is no quota. The shift pays for whatever you sell.

## Selling

1. Build a **pickup zone** with the Pickup tool (open from the start). It is a
   platform of fixed size, placed with one click on open ground under open sky
   (see [[Belts]]).
2. Heap resources on it — by hand, by drill spill or on a belt. The platform
   has no walls: loose cargo forms a natural heap and the excess slides off the
   edges, liquids run off. Above the platform is the **cargo box**, drawn as a
   dashed outline in the zone colour; it is tall enough for the biggest heap
   the platform can hold.
3. Call the **drone** with the button on the market panel or **F**. It costs
   $10 per trip. Halfway through the trip it takes every priced cell inside the
   cargo box and pays at the prices of that moment. Soil, slag, water and
   anything outside the box stay where they are. A box with nothing priced
   still costs the fee.

The drone comes from the sky, so it needs a clear way down. A call is refused,
with the reason, when there is no zone, when the zone is too far away (outside
the simulated part of the world around you), or when something solid — rock,
metal, glass or a building — stands in the sky above the cargo box. Loose
material and liquid never block it. If any of these happens while the drone is
still on its way in, it turns back and the fee is refunded.

The panel shows what lies in the cargo box and what it is worth right now, and
the button pulses once the haul is worth more than the fee. When a call would
be refused, the button shows the same reason.

## Prices

| good | base price | half-life |
| --- | --- | --- |
| gravel | $4 | 3 min |
| sand | $5 | 3 min |
| coal | $10 | 6 min |
| ferrite | $14 | 6 min |
| iron (and scrap) | $44 | 12 min |
| glass (and cullet) | $64 | 16 min |

Every price halves once per half-life of game time and never falls below 15% of
its base, so raw material goes cheap quickly and the money moves to whatever
takes a furnace to make. Selling does not move a price.

## Spending

You start with $25. Everything but drill, hand and pickup zone is bought in the
**E** menu — click a locked tool:

| tool | price |
| --- | --- |
| Igniter | $60 |
| Wall | $120 |
| Belt | $240 |
