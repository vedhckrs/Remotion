import { scaleLinear, scaleBand, line, area, pie, arc, hierarchy, tree, geoMercator, forceSimulation, forceLink, forceManyBody, forceCenter, randomLcg, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3';
export function chartGeometry(data: {
    label: string;
    value: number;
}[], width: number, height: number) {
    const x = scaleBand<string>().domain(data.map(d => d.label)).range([0, width]).padding(.2);
    const y = scaleLinear().domain([0, Math.max(1, ...data.map(d => d.value))]).range([height, 0]);
    const pts = data.map(d => [x(d.label)! + x.bandwidth() / 2, y(d.value)] as [
        number,
        number
    ]);
    return {
        bars: data.map(d => ({
            label: d.label, value: d.value, x: x(d.label)!, y: y(d.value), width: x.bandwidth(), height: height - y(d.value)
        })), line: line<[
            number,
            number
        ]>()(pts) || '', area: area<[
            number,
            number
        ]>().x(d => d[0]).y0(height).y1(d => d[1])(pts) || '', donut: pie<{
            label: string;
            value: number;
        }>().value(d => d.value)(data).map(d => ({
            label: d.data.label, path: arc<any>().innerRadius(height * .23).outerRadius(height * .4)(d) || ''
        }))
    };
}
export function funnelGeometry(data: {
    label: string;
    value: number;
}[], width: number, height: number) {
    const maximum = Math.max(1, ...data.map(stage => stage.value));
    const step = height / Math.max(1, data.length);
    return data.map((stage, index) => {
        const top = width * .85 * stage.value / maximum, bottom = width * .85 * (data[index + 1]?.value ?? stage.value * .7) / maximum;
        const y0 = index * step, y1 = (index + 1) * step - Math.min(8, step * .1);
        return {
            ...stage, y: (y0 + y1) / 2, path: `M${(width - top) / 2} ${y0} L${(width + top) / 2} ${y0} L${(width + bottom) / 2} ${y1} L${(width - bottom) / 2} ${y1} Z`
        };
    });
}
export function treeGeometry(labels: string[], width: number, height: number) {
    const root = hierarchy({
        name: labels[0] || 'Root', children: labels.slice(1).map(name => ({
            name, children: []
        }))
    });
    const nodes = tree<any>().size([width, height])(root);
    return nodes.descendants().map(n => ({
        label: n.data.name as string, x: n.x, y: n.y, parent: n.parent ? {
            x: n.parent.x, y: n.parent.y
        } : null
    }));
}
export function geoGeometry(points: {
    id: string;
    label: string;
    longitude: number;
    latitude: number;
}[], width: number, height: number) {
    const projection = geoMercator().scale(Math.min(width, height) * .8 / (2 * Math.PI)).translate([width / 2, height / 2]);
    return points.map(p => ({
        ...p, x: projection([p.longitude, Math.max(-85, Math.min(85, p.latitude))])![0], y: projection([p.longitude, Math.max(-85, Math.min(85, p.latitude))])![1]
    }));
}
export function networkGeometry(ids: string[], links: {
    from: string;
    to: string;
}[], seed: number) {
    const nodes: (SimulationNodeDatum & {
        id: string;
    })[] = ids.map(id => ({
        id
    }));
    const edges: SimulationLinkDatum<typeof nodes[number]>[] = links.map(l => ({
        source: l.from, target: l.to
    }));
    const simulation = forceSimulation(nodes).randomSource(randomLcg(seed)).force('link', forceLink(edges).id((n: any) => n.id).distance(180)).force('charge', forceManyBody().strength(-800)).force('center', forceCenter(500, 320)).stop();
    simulation.tick(180);
    const minX = Math.min(...nodes.map(n => n.x!)), maxX = Math.max(...nodes.map(n => n.x!)), minY = Math.min(...nodes.map(n => n.y!)), maxY = Math.max(...nodes.map(n => n.y!));
    return nodes.map(n => ({
        id: n.id, x: maxX === minX ? .5 : .12 + .76 * (n.x! - minX) / (maxX - minX), y: maxY === minY ? .5 : .2 + .6 * (n.y! - minY) / (maxY - minY)
    }));
}
