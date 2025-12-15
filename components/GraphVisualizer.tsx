import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphData, Node, Link } from '../types';

interface GraphVisualizerProps {
  data: GraphData;
}

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.parentElement?.clientWidth || 800;
    const height = 600;

    // Create a deep copy of data because d3 mutates it
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("max-width", "100%")
      .style("height", "auto");

    // Arrow marker
    svg.append("defs").selectAll("marker")
      .data(["end"])
      .enter().append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#999")
      .attr("d", "M0,-5L10,0L0,5");

    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // Link labels
    const linkLabel = svg.append("g")
        .attr("class", "link-labels")
        .selectAll("text")
        .data(links)
        .enter().append("text")
        .attr("font-family", "sans-serif")
        .attr("font-size", "10px")
        .attr("fill", "#666")
        .attr("text-anchor", "middle")
        .text((d: any) => d.type);

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("g")
      .data(nodes)
      .join("g")
      // Drag behavior
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => color(d.label));

    node.append("title")
      .text((d: any) => d.id);

    node.append("text")
      .attr("x", 12)
      .attr("y", "0.31em")
      .text((d: any) => d.id)
      .clone(true).lower()
      .attr("fill", "none")
      .attr("stroke", "white")
      .attr("stroke-width", 3);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div className="w-full h-[600px] border border-gray-200 rounded-lg overflow-hidden bg-slate-50 relative">
        <div className="absolute top-2 right-2 z-10 bg-white/80 p-2 text-xs rounded shadow">
             <div className="font-bold mb-1">Graph Legend</div>
             {data.nodes.length === 0 && <span className="text-gray-500">No data loaded</span>}
             <div className="flex flex-wrap gap-2">
                {[...new Set(data.nodes.map(n => n.label))].map((label, i) => (
                    <span key={label} className="px-1 rounded border" style={{ borderColor: d3.schemeCategory10[i % 10] }}>{label}</span>
                ))}
             </div>
        </div>
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};

export default GraphVisualizer;
