import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { GraphData } from '../types';
import { cn } from '../lib/utils';

interface GraphVisualizerProps {
  data: GraphData;
}

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(true);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.nodes.length === 0) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 600;

    // Create a deep copy of data because d3 mutates it
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(30));

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("width", "100%")
      .style("height", "100%");

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
      .attr("fill", "#94a3b8") // slate-400
      .attr("d", "M0,-5L10,0L0,5");

    const link = svg.append("g")
      .attr("stroke", "#cbd5e1") // slate-300
      .attr("stroke-opacity", 0.8)
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
        .attr("fill", "#64748b") // slate-500
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .text((d: any) => d.type);

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab")
      // Drag behavior
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", 10)
      .attr("fill", (d: any) => color(d.label));

    node.append("title")
      .text((d: any) => d.id);

    // Node labels with halo for better visibility
    const labels = node.append("text")
      .attr("x", 14)
      .attr("y", "0.31em")
      .text((d: any) => d.id)
      .attr("fill", "#0f172a") // slate-900
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .style("pointer-events", "none");

    // Add white halo to text
    labels.clone(true).lower()
      .attr("fill", "none")
      .attr("stroke", "white")
      .attr("stroke-width", 4);

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

  const uniqueLabels = [...new Set(data.nodes.map(n => n.label))];
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-50/30">
        <div className={cn(
            "absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 transition-all duration-300",
            isLegendOpen ? "p-3 max-w-[200px]" : "p-2 w-auto"
        )}>
             <button 
                onClick={() => setIsLegendOpen(!isLegendOpen)}
                className="flex items-center justify-between w-full text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors"
             >
                {isLegendOpen && <span className="uppercase tracking-wider mr-2">Legend</span>}
                {isLegendOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
             </button>
             
             {isLegendOpen && (
                <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {data.nodes.length === 0 && <span className="text-slate-400 text-xs italic">No nodes</span>}
                    <div className="flex flex-wrap gap-2">
                        {uniqueLabels.map((label, i) => (
                            <span 
                                key={label} 
                                className="px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 bg-slate-50 text-slate-700"
                                style={{ borderColor: colorScale(label) as string }}
                            >
                                <span 
                                    className="w-2 h-2 rounded-full" 
                                    style={{ backgroundColor: colorScale(label) as string }}
                                />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
             )}
        </div>
      <svg ref={svgRef} className="w-full h-full block"></svg>
    </div>
  );
};

export default GraphVisualizer;