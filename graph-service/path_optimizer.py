import logging
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, LpBinary, value

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PathOptimizer:
    """Uses Linear Programming to prune A* paths based on Cost/Time Constraints."""

    def optimize_path(self, path_steps, max_budget=None, max_hours=None):
        """
        Takes a list of standard A* path steps from our engine and drops 'optional' nodes 
        if the total path exceeds the user's constraints.
        
        Note: In a true prerequisite graph, dropping a middle node breaks the path. 
        For this FYP implementation, we assume we can skip a step if we must meet the budget, 
        sacrificing total path relevance (Heuristic W) to satisfy hard constraints.
        """
        if not path_steps:
            return []
            
        if max_budget is None and max_hours is None:
            logger.info("No constraints provided. Returning original A* path.")
            return path_steps

        logger.info(f"Optimizing Path. Constraints - Budget: ${max_budget}, Time: {max_hours}hrs")
        
        # 1. Define the LP Problem
        prob = LpProblem("CareerPathOptimization", LpMaximize)
        
        # 2. Decision Variables: x_i is 1 if we take the course, 0 if we drop it
        n = len(path_steps)
        vars_dict = {}
        for i in range(n):
            # Create a binary variable for each step in the path
            vars_dict[i] = LpVariable(f"TakeStep_{i}", cat=LpBinary)
            
        # 3. Objective Function: Maximize total Relevance (Demand Weight)
        # We want to keep the most relevant courses
        # Assuming our 'weight' from A* incorporates relevance inversely, or we just maximize count for now
        # Ideally, we would explicitly extract the demand_weight. Here we'll treat 'weight' as the value to maximize.
        # However, A* minimizes weight. Let's maximize a constant 1 per core step, or inversely proportional to A* weight.
        # For simplicity in this mockup, we maximize the number of steps kept (1 per step), 
        # but penalize highly for dropping.
        prob += lpSum([vars_dict[i] * (1.0 / (path_steps[i]['weight'] + 0.001)) for i in range(n)])
        
        # 4. Constraints
        if max_budget is not None:
            prob += lpSum([vars_dict[i] * path_steps[i]['cost'] for i in range(n)]) <= max_budget, "BudgetConstraint"
            
        if max_hours is not None:
            prob += lpSum([vars_dict[i] * path_steps[i]['hours'] for i in range(n)]) <= max_hours, "TimeConstraint"
            
        # Optional Context Constraint: The first and last steps are critical bookends
        if n >= 2:
            prob += vars_dict[0] == 1, "MustTakeFirstStep"
            prob += vars_dict[n-1] == 1, "MustTakeLastStep"
            
        # 5. Solve
        prob.solve()
        
        status = prob.status
        logger.info(f"LP Optimization Status: {status} (1=Optimal, -1=Infeasible)")
        
        if status != 1:
            logger.warning("Constraints are too tight! No feasible path exists. Returning truncated best-effort path.")
            # If infeasible, we just return the original path but flag it
            return path_steps
            
        # 6. Reconstruct the optimized path
        optimized_steps = []
        for i in range(n):
            take_it = value(vars_dict[i])
            if take_it == 1.0:
                optimized_steps.append(path_steps[i])
            else:
                logger.info(f"Optimization dropped course: {path_steps[i]['course']} to meet constraints.")
                
        return optimized_steps

if __name__ == "__main__":
    # Test execution
    optimizer = PathOptimizer()
    
    # Mock A* output path
    mock_path = [
        {"from_node": "Foundation", "to_node": "Python", "course": "Python Basics", "weight": 0.5, "cost": 0, "hours": 20},
        {"from_node": "Python", "to_node": "Pandas", "course": "Data Analysis", "weight": 0.3, "cost": 50, "hours": 30},
        {"from_node": "Pandas", "to_node": "Machine Learning", "course": "ML Specialization", "weight": 0.8, "cost": 200, "hours": 100}
    ]
    
    print("\n--- ORIGINAL PATH ---")
    total_cost = sum(s['cost'] for s in mock_path)
    total_time = sum(s['hours'] for s in mock_path)
    print(f"Total Cost: ${total_cost}, Total Time: {total_time}hrs")
    
    print("\n--- OPTIMIZED PATH (Max Budget $100) ---")
    # Budget is $100, so it should drop the middle Pandas course ($50) because ML ($200) is required (MustTakeLastStep constraint will fail)
    # Actually wait, if ML is $200 and Budget is $100, it's infeasible.
    
    # Let's test budget $210
    opt_path = optimizer.optimize_path(mock_path, max_budget=210)
    opt_cost = sum(s['cost'] for s in opt_path)
    print(f"Optimized Cost: ${opt_cost}")
    for s in opt_path:
        print(f"Kept: {s['course']}")
