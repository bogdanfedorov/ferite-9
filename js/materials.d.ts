export type MT = number
export type MaterialID = number

export type Temperature = number
export type ThermalConductivity = Temperature // Temperature * 1t
export type HeatCapacity = Temperature // Temperature * 1kg
export type Color = [number, number, number]
export type LocalizationKey = string

export type Material = {
    key: LocalizationKey
    type: MT
    col: Color
    varr: number
    hard: number
    heat: Temperature
    cond: ThermalConductivity
    relax: number
    heatCap: HeatCapacity
    density: number
    glow: number
    life: number[]

    melt: Temperature
    meltTo: MaterialID

    freeze: Temperature
    freezeTo: MaterialID

    settlesTo: MaterialID

    looseTo: MaterialID
}

export type Materials = Record<MaterialID, Material>