import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import { GraphData } from '../types';
import { cn } from '../lib/utils';

interface GraphVisualizerProps {
  data: GraphData;
}

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    if (data.nodes.length === 0) {
      // Initialize zoom even with no nodes
      const svg = d3.select(svgRef.current);
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          transformRef.current = event.transform;
          setZoomLevel(event.transform.k);
        });
      svg.call(zoom);
      zoomRef.current = zoom;
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 600;

    // Create a deep copy of data because d3 mutates it
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    // Better color scheme with higher contrast
    const colorMap: { [key: string]: string } = {
      'Person': '#ef4444',      // red-500
      'Organization': '#3b82f6', // blue-500
      'Location': '#f59e0b',     // amber-500
      'Concept': '#10b981',      // emerald-500
      'Event': '#8b5cf6',        // violet-500
      'Product': '#ec4899',      // pink-500
    };
    
    const getColor = (label: string) => {
      return colorMap[label] || d3.schemeCategory10[parseInt(label) % 10] || '#6b7280';
    };

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(30));

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("width", "100%")
      .style("height", "100%")
      .style("background", "#f8fafc"); // Light slate background

    // Container group for zoom/pan
    const g = svg.append("g").attr("class", "graph-container");

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
      .attr("fill", "#64748b") // slate-500 - darker for visibility
      .attr("d", "M0,-5L10,0L0,5");

    const link = g.append("g")
      .attr("class", "links")
      .attr("stroke", "#94a3b8") // slate-400
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)");

    // Link labels
    const linkLabel = g.append("g")
        .attr("class", "link-labels")
        .selectAll("text")
        .data(links)
        .enter().append("text")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .attr("fill", "#475569") // slate-600 - darker for visibility
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .style("user-select", "none")
        .text((d: any) => d.type);

    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab")
      .call(
        d3.drag<any, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Node circles with better visibility
    node.append("circle")
      .attr("r", 12)
      .attr("fill", (d: any) => getColor(d.label))
      .attr("stroke", "#1e293b") // slate-800 - dark stroke for contrast
      .attr("stroke-width", 2.5)
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");

    node.append("title")
      .text((d: any) => `${d.id} (${d.label})`);

    // Node labels with better visibility
    const labels = node.append("text")
      .attr("x", 16)
      .attr("y", "0.31em")
      .text((d: any) => d.id)
      .attr("fill", "#0f172a") // slate-900 - very dark
      .attr("font-size", "13px")
      .attr("font-weight", "600")
      .style("pointer-events", "none")
      .style("user-select", "none");

    // Add white halo to text for better visibility
    labels.clone(true).lower()
      .attr("fill", "white")
      .attr("stroke", "white")
      .attr("stroke-width", 5)
      .attr("stroke-linejoin", "round");

    // Zoom and pan behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        g.attr("transform", event.transform);
        setZoomLevel(event.transform.k);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Node drag behavior (separate from zoom)
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      if (event.sourceEvent) {
        event.sourceEvent.stopPropagation(); // Prevent panning when dragging nodes
        d3.select(event.sourceEvent.target).style("cursor", "grabbing");
      }
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
      if (event.sourceEvent) {
        event.sourceEvent.stopPropagation(); // Prevent panning when dragging nodes
      }
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      if (event.sourceEvent) {
        event.sourceEvent.stopPropagation(); // Prevent panning when dragging nodes
        d3.select(event.sourceEvent.target).style("cursor", "grab");
      }
    }

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

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data]);

  const uniqueLabels = [...new Set(data.nodes.map(n => n.label))];
  
  // Color mapping matching the visualization
  const colorMap: { [key: string]: string } = {
    'Person': '#ef4444',
    'Organization': '#3b82f6',
    'Location': '#f59e0b',
    'Concept': '#10b981',
    'Event': '#8b5cf6',
    'Product': '#ec4899',
  };
  
  const getColor = (label: string) => {
    return colorMap[label] || '#6b7280';
  };

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(200).call(zoomRef.current.scaleBy, 1.5);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(200).call(zoomRef.current.scaleBy, 1 / 1.5);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 600;
    svg.transition().duration(300).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(1).translate(-width / 2, -height / 2)
    );
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-50">
        {/* Zoom Controls */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-2">
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-slate-100 rounded-md transition-colors flex items-center justify-center"
            title="Zoom In"
          >
            <ZoomIn size={18} className="text-slate-700" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-slate-100 rounded-md transition-colors flex items-center justify-center"
            title="Zoom Out"
          >
            <ZoomOut size={18} className="text-slate-700" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 hover:bg-slate-100 rounded-md transition-colors flex items-center justify-center"
            title="Reset View"
          >
            <RotateCcw size={18} className="text-slate-700" />
          </button>
          <div className="h-px bg-slate-200 my-1"></div>
          <div className="px-2 py-1 text-xs text-slate-500 text-center">
            {Math.round(zoomLevel * 100)}%
          </div>
          <div className="px-2 py-1 text-xs text-slate-400 text-center flex items-center gap-1">
            <Move size={12} />
            <span>Drag to pan</span>
          </div>
        </div>

        {/* Legend */}
        <div className={cn(
            "absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 transition-all duration-300",
            isLegendOpen ? "p-3 max-w-[220px]" : "p-2 w-auto"
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
                        {uniqueLabels.map((label) => (
                            <span 
                                key={label} 
                                className="px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 bg-slate-50 text-slate-700"
                                style={{ borderColor: getColor(label) }}
                            >
                                <span 
                                    className="w-2.5 h-2.5 rounded-full border border-slate-300" 
                                    style={{ backgroundColor: getColor(label) }}
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