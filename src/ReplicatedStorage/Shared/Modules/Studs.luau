local Studs = {}

Studs.UnitName = "studs"
Studs.SpeedUnitName = "studs/second"

function Studs.scalar(value: number): number
	return value
end

function Studs.vector(x: number, y: number, z: number): Vector3
	return Vector3.new(x, y, z)
end

function Studs.offset(x: number, y: number, z: number): CFrame
	return CFrame.new(x, y, z)
end

function Studs.cframe(position: Vector3): CFrame
	return CFrame.new(position)
end

function Studs.perSecond(value: number): number
	return value
end

return Studs
